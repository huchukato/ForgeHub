"""Convert ComfyUI UI-format (canvas) graphs to API prompt format.

UI files saved from the ComfyUI canvas use keys like ``nodes``, ``links``,
``last_node_id`` and ``groups``. The ``/prompt`` endpoint instead expects the
API format ``{"<id>": {"class_type": ..., "inputs": {...}}}``.

Widget names are resolved through ComfyUI's ``/object_info`` endpoint; links
are traced through bypassed, muted and reroute nodes.
"""

import logging
from typing import Any

logger = logging.getLogger("forgehub.ui_to_api")

# LiteGraph node modes
MODE_NORMAL = 0
MODE_BYPASS = 2
MODE_MUTED = 4

# Node types that never produce an API node.
SKIP_TYPES = {"Note", "MarkdownNote"}
REROUTE_TYPES = {"Reroute"}
PRIMITIVE_TYPES = {"PrimitiveNode"}

# object_info input spec types that are widgets (serialized values) rather
# than connectable inputs.
WIDGET_INPUT_TYPES = {
    "INT",
    "FLOAT",
    "STRING",
    "BOOLEAN",
    "TEXT",
    "COMBO",
    "SEED",
    "COLOR",
    "PATH",
    "FILE",
    "IMAGEUPLOAD",
    "VIDEOUPLOAD",
    "AUDIOUPLOAD",
    "FILEUPLOAD",
    "LABEL",
    "BUTTON",
}

# Values emitted by the "control after generate" widget appended after
# seed/noise widgets; they have no counterpart in the API format.
CONTROL_AFTER_GENERATE_VALUES = {"fixed", "increment", "decrement", "randomize"}

MAX_LINK_DEPTH = 128


class UIConversionError(Exception):
    """Raised when a UI-format workflow cannot be converted to API format."""


def _is_widget_spec(spec: Any) -> bool:
    """True when an object_info input spec is a widget value, not a link input."""
    if not isinstance(spec, (list, tuple)) or not spec:
        return False
    head = spec[0]
    # Combo widgets: spec[0] is the list of allowed options.
    if isinstance(head, (list, tuple, dict)):
        return True
    if isinstance(head, str):
        return head.upper() in WIDGET_INPUT_TYPES
    return False


def _ordered_params(info: dict[str, Any]) -> list[tuple[str, Any]]:
    """Flatten required+optional input specs of a class_type, in order."""
    input_spec = info.get("input") or {}
    params: list[tuple[str, Any]] = []
    for section in ("required", "optional"):
        entries = input_spec.get(section) or {}
        if isinstance(entries, dict):
            params.extend(entries.items())
    return params


def _passthrough_input(
    node: dict[str, Any],
    out_slot: int,
    match_index: bool = True,
    fallback_first: bool = False,
) -> dict | None:
    """Find the input that feeds the given output slot of a pass-through node.

    For bypassed nodes prefer the input at the same index, then match by
    type. Muted nodes only propagate when an input of the same type exists.
    Reroute nodes also accept the first linked input as a last resort.
    """
    inputs = [i for i in node.get("inputs") or [] if isinstance(i, dict)]
    outputs = node.get("outputs") or []
    if match_index and 0 <= out_slot < len(inputs) and inputs[out_slot].get("link") is not None:
        return inputs[out_slot]
    out_type = None
    if 0 <= out_slot < len(outputs) and isinstance(outputs[out_slot], dict):
        out_type = outputs[out_slot].get("type")
    if out_type is not None:
        for inp in inputs:
            if inp.get("link") is not None and inp.get("type") == out_type:
                return inp
    if fallback_first:
        for inp in inputs:
            if inp.get("link") is not None:
                return inp
    return None


def _primitive_value(node: dict[str, Any]) -> Any:
    values = node.get("widgets_values")
    if isinstance(values, dict):
        return next(iter(values.values()), None)
    if isinstance(values, (list, tuple)):
        return values[0] if values else None
    return values


def _resolve_source(
    node_by_id: dict[Any, dict],
    links: dict[Any, list],
    node_id: Any,
    slot: Any,
    depth: int = 0,
) -> tuple[str, Any, Any] | None:
    """Trace a link upstream through bypass/muted/reroute/primitive nodes.

    Returns ("link", src_node_id, src_slot) for a real producer node,
    ("value", value, None) when the chain ends in a PrimitiveNode, or None
    when the link dies (muted without a matching pass-through, missing node).
    """
    if depth > MAX_LINK_DEPTH:
        raise UIConversionError(f"link chain longer than {MAX_LINK_DEPTH} (possible cycle at node {node_id})")
    node = node_by_id.get(node_id)
    if node is None:
        return None
    ntype = str(node.get("type") or "")
    mode = node.get("mode") or 0

    if ntype in PRIMITIVE_TYPES:
        return ("value", _primitive_value(node), None)
    if ntype in SKIP_TYPES:
        return None
    if ntype in REROUTE_TYPES or mode in (MODE_BYPASS, MODE_MUTED):
        try:
            slot_index = int(slot)
        except (TypeError, ValueError):
            slot_index = 0
        inp = _passthrough_input(
            node,
            slot_index,
            match_index=(mode != MODE_MUTED),
            fallback_first=(ntype in REROUTE_TYPES),
        )
        if inp is None:
            return None
        upstream = links.get(inp.get("link"))
        if upstream is None:
            return None
        return _resolve_source(node_by_id, links, upstream[1], upstream[2], depth + 1)

    return ("link", node_id, slot)


def _linked_inputs(
    node: dict[str, Any],
    node_by_id: dict[Any, dict],
    links: dict[Any, list],
) -> dict[str, Any]:
    """Resolve every connected input of a node to [src_id, slot] or a value."""
    api_inputs: dict[str, Any] = {}
    for inp in node.get("inputs") or []:
        if not isinstance(inp, dict):
            continue
        link_id = inp.get("link")
        if link_id is None:
            continue
        link = links.get(link_id)
        if link is None:
            continue
        resolved = _resolve_source(node_by_id, links, link[1], link[2])
        if resolved is None:
            continue
        widget = inp.get("widget") if isinstance(inp.get("widget"), dict) else {}
        name = widget.get("name") or inp.get("name")
        if not name:
            continue
        if resolved[0] == "value":
            api_inputs[name] = resolved[1]
        else:
            api_inputs[name] = [str(resolved[1]), resolved[2]]
    return api_inputs


def _widget_names_from_inputs(node: dict[str, Any]) -> set[str]:
    """Names of widgets converted to inputs (they don't consume widget slots)."""
    names = set()
    for inp in node.get("inputs") or []:
        if isinstance(inp, dict) and isinstance(inp.get("widget"), dict):
            if inp["widget"].get("name"):
                names.add(inp["widget"]["name"])
    return names


def _assign_widget_values(
    node: dict[str, Any],
    api_inputs: dict[str, Any],
    object_info: dict[str, Any],
) -> None:
    ntype = str(node.get("type") or "")
    node_id = node.get("id")
    values = node.get("widgets_values")
    converted = _widget_names_from_inputs(node)

    # Newer frontends serialize widgets as {name: value}.
    if isinstance(values, dict):
        for key, value in values.items():
            if key not in converted:
                api_inputs.setdefault(key, value)
        return

    if not isinstance(values, (list, tuple)) or not values:
        return

    info = object_info.get(ntype)
    if info is None:
        # Fallback: no object_info for this class_type. Map values to widget
        # names declared on converted inputs — best effort, order may differ.
        names = [
            inp["widget"]["name"]
            for inp in node.get("inputs") or []
            if isinstance(inp, dict)
            and isinstance(inp.get("widget"), dict)
            and inp["widget"].get("name")
        ]
        logger.warning(
            "[ui_to_api] object_info has no class_type %s (node %s); "
            "widget mapping is heuristic", ntype, node_id,
        )
        for pos, value in enumerate(values):
            if pos < len(names) and names[pos] not in api_inputs:
                api_inputs[names[pos]] = value
            else:
                logger.warning(
                    "[ui_to_api] unmapped widget value %r at index %d for node %s (%s)",
                    value, pos, node_id, ntype,
                )
        return

    idx = 0
    for pname, spec in _ordered_params(info):
        if not _is_widget_spec(spec):
            continue
        if pname in converted:
            # Widget was converted to an input: it is fed by a link (or left
            # at its default when unlinked) and consumes no widget slot.
            continue
        if idx >= len(values):
            break
        api_inputs.setdefault(pname, values[idx])
        idx += 1
        # Seed/noise widgets are followed by a control_after_generate value
        # ("fixed"/"randomize"/...) that has no API counterpart.
        spec_cfg = spec[1] if len(spec) > 1 and isinstance(spec[1], dict) else {}
        if spec_cfg.get("control_after_generate") or "seed" in pname.lower():
            if (
                idx < len(values)
                and isinstance(values[idx], str)
                and values[idx] in CONTROL_AFTER_GENERATE_VALUES
            ):
                idx += 1
    if idx < len(values):
        logger.warning(
            "[ui_to_api] node %s (%s): %d unmapped widget value(s): %r",
            node_id, ntype, len(values) - idx, list(values[idx:]),
        )


def convert_ui_to_api(graph: dict[str, Any], object_info: dict[str, Any]) -> dict[str, Any]:
    """Convert a ComfyUI UI-format graph into an API prompt dict.

    ``object_info`` is the response of ComfyUI's ``/object_info`` endpoint and
    is used to map ``widgets_values`` onto their parameter names. Raises
    ``UIConversionError`` with the offending node in the message on failure.
    """
    if not isinstance(graph, dict):
        raise UIConversionError("workflow is not a JSON object")
    nodes = graph.get("nodes")
    if not isinstance(nodes, list):
        raise UIConversionError("UI workflow is missing the 'nodes' list")

    node_by_id = {
        node["id"]: node
        for node in nodes
        if isinstance(node, dict) and node.get("id") is not None
    }
    links: dict[Any, list] = {}
    for link in graph.get("links") or []:
        if isinstance(link, (list, tuple)) and len(link) >= 5:
            links[link[0]] = link

    api: dict[str, Any] = {}
    for node in nodes:
        if not isinstance(node, dict) or node.get("id") is None:
            continue
        ntype = str(node.get("type") or "")
        mode = node.get("mode") or 0
        if (
            mode in (MODE_BYPASS, MODE_MUTED)
            or ntype in SKIP_TYPES
            or ntype in REROUTE_TYPES
            or ntype in PRIMITIVE_TYPES
        ):
            continue
        try:
            api_inputs = _linked_inputs(node, node_by_id, links)
            _assign_widget_values(node, api_inputs, object_info or {})
        except UIConversionError:
            raise
        except Exception as exc:
            raise UIConversionError(f"node {node.get('id')} ({ntype}): {exc}") from exc
        api[str(node["id"])] = {"class_type": ntype, "inputs": api_inputs}

    if not api:
        raise UIConversionError("UI workflow contains no executable nodes")
    return api
