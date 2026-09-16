import pytest

from forgehub_backend.ui_to_api import UIConversionError, convert_ui_to_api


OBJECT_INFO = {
    "CheckpointLoaderSimple": {
        "input": {
            "required": {
                "ckpt_name": [["sdxl.safetensors", "pony.safetensors"], {}],
            }
        }
    },
    "CLIPTextEncode": {
        "input": {
            "required": {
                "text": ["STRING", {"multiline": True}],
                "clip": ["CLIP"],
            }
        }
    },
    "EmptyLatentImage": {
        "input": {
            "required": {
                "width": ["INT", {"default": 512}],
                "height": ["INT", {"default": 512}],
                "batch_size": ["INT", {"default": 1}],
            }
        }
    },
    "KSampler": {
        "input": {
            "required": {
                "model": ["MODEL"],
                "seed": ["INT", {"default": 0, "control_after_generate": True}],
                "steps": ["INT", {"default": 20}],
                "cfg": ["FLOAT", {"default": 8.0}],
                "sampler_name": [["euler", "dpmpp_2m"], {}],
                "scheduler": [["normal", "karras"], {}],
                "positive": ["CONDITIONING"],
                "negative": ["CONDITIONING"],
                "latent_image": ["LATENT"],
                "denoise": ["FLOAT", {"default": 1.0}],
            }
        }
    },
    "VAEDecode": {
        "input": {
            "required": {
                "samples": ["LATENT"],
                "vae": ["VAE"],
            }
        }
    },
    "SaveImage": {
        "input": {
            "required": {
                "images": ["IMAGE"],
                "filename_prefix": ["STRING", {"default": "ComfyUI"}],
            }
        }
    },
}


def _ui_graph():
    """CheckpointLoader -> KSampler -> VAEDecode -> SaveImage, with a bypass
    node on VAE, a reroute on LATENT, a muted node on IMAGE, a PrimitiveNode
    feeding EmptyLatentImage.width and a Note that must be skipped."""
    return {
        "last_node_id": 13,
        "last_link_id": 16,
        "nodes": [
            {
                "id": 1,
                "type": "CheckpointLoaderSimple",
                "mode": 0,
                "inputs": [],
                "outputs": [
                    {"name": "MODEL", "type": "MODEL", "links": [1], "slot_index": 0},
                    {"name": "CLIP", "type": "CLIP", "links": [2, 8], "slot_index": 1},
                    {"name": "VAE", "type": "VAE", "links": [6], "slot_index": 2},
                ],
                "widgets_values": ["sdxl.safetensors"],
            },
            {
                "id": 2,
                "type": "CLIPTextEncode",
                "mode": 0,
                "inputs": [{"name": "clip", "type": "CLIP", "link": 2}],
                "outputs": [
                    {"name": "CONDITIONING", "type": "CONDITIONING", "links": [3], "slot_index": 0}
                ],
                "widgets_values": ["a cat"],
            },
            {
                "id": 6,
                "type": "CLIPTextEncode",
                "mode": 0,
                "inputs": [{"name": "clip", "type": "CLIP", "link": 8}],
                "outputs": [
                    {"name": "CONDITIONING", "type": "CONDITIONING", "links": [9], "slot_index": 0}
                ],
                "widgets_values": ["bad hands"],
            },
            {
                "id": 7,
                "type": "EmptyLatentImage",
                "mode": 0,
                # "width" widget converted to input, fed by PrimitiveNode 13
                "inputs": [
                    {"name": "width", "type": "INT", "link": 16, "widget": {"name": "width"}}
                ],
                "outputs": [
                    {"name": "LATENT", "type": "LATENT", "links": [10], "slot_index": 0}
                ],
                "widgets_values": [512, 1],
            },
            {
                "id": 3,
                "type": "KSampler",
                "mode": 0,
                "inputs": [
                    {"name": "model", "type": "MODEL", "link": 1},
                    {"name": "positive", "type": "CONDITIONING", "link": 3},
                    {"name": "negative", "type": "CONDITIONING", "link": 9},
                    {"name": "latent_image", "type": "LATENT", "link": 10},
                ],
                "outputs": [
                    {"name": "LATENT", "type": "LATENT", "links": [12], "slot_index": 0}
                ],
                "widgets_values": [42, "randomize", 20, 8.0, "euler", "normal", 1.0],
            },
            # bypass node on the VAE path (mode 2)
            {
                "id": 9,
                "type": "SomePassthrough",
                "mode": 2,
                "inputs": [{"name": "vae", "type": "VAE", "link": 6}],
                "outputs": [{"name": "VAE", "type": "VAE", "links": [11], "slot_index": 0}],
                "widgets_values": [],
            },
            # reroute on the LATENT path
            {
                "id": 10,
                "type": "Reroute",
                "mode": 0,
                "inputs": [{"name": "", "type": "*", "link": 12}],
                "outputs": [{"name": "", "type": "LATENT", "links": [13], "slot_index": 0}],
            },
            # muted node on the IMAGE path (mode 4): link must be propagated
            {
                "id": 11,
                "type": "ImagePassthrough",
                "mode": 4,
                "inputs": [{"name": "image", "type": "IMAGE", "link": 14}],
                "outputs": [{"name": "IMAGE", "type": "IMAGE", "links": [15], "slot_index": 0}],
            },
            {
                "id": 4,
                "type": "VAEDecode",
                "mode": 0,
                "inputs": [
                    {"name": "samples", "type": "LATENT", "link": 13},
                    {"name": "vae", "type": "VAE", "link": 11},
                ],
                "outputs": [
                    {"name": "IMAGE", "type": "IMAGE", "links": [14], "slot_index": 0}
                ],
            },
            {
                "id": 5,
                "type": "SaveImage",
                "mode": 0,
                "inputs": [{"name": "images", "type": "IMAGE", "link": 15}],
                "outputs": [],
                "widgets_values": ["forgehub/test"],
            },
            # primitive feeding EmptyLatentImage.width
            {
                "id": 13,
                "type": "PrimitiveNode",
                "mode": 0,
                "inputs": [],
                "outputs": [{"name": "INT", "type": "INT", "links": [16], "slot_index": 0}],
                "widgets_values": [768],
            },
            # a note: must be skipped entirely
            {"id": 12, "type": "Note", "mode": 0, "widgets_values": ["hello"]},
        ],
        "links": [
            [1, 1, 0, 3, 0, "MODEL"],
            [2, 1, 1, 2, 0, "CLIP"],
            [3, 2, 0, 3, 1, "CONDITIONING"],
            [6, 1, 2, 9, 0, "VAE"],
            [8, 1, 1, 6, 0, "CLIP"],
            [9, 6, 0, 3, 2, "CONDITIONING"],
            [10, 7, 0, 3, 3, "LATENT"],
            [11, 9, 0, 4, 1, "VAE"],
            [12, 3, 0, 10, 0, "LATENT"],
            [13, 10, 0, 4, 0, "LATENT"],
            [14, 4, 0, 11, 0, "IMAGE"],
            [15, 11, 0, 5, 0, "IMAGE"],
            [16, 13, 0, 7, 0, "INT"],
        ],
        "groups": [],
        "extra": {},
    }


def test_basic_structure():
    api = convert_ui_to_api(_ui_graph(), OBJECT_INFO)
    assert set(api) == {"1", "2", "3", "4", "5", "6", "7"}
    assert api["1"]["class_type"] == "CheckpointLoaderSimple"
    assert api["1"]["inputs"] == {"ckpt_name": "sdxl.safetensors"}


def test_linked_inputs_resolve_to_node_slot_pairs():
    api = convert_ui_to_api(_ui_graph(), OBJECT_INFO)
    ksampler = api["3"]["inputs"]
    assert ksampler["model"] == ["1", 0]
    assert ksampler["positive"] == ["2", 0]
    assert ksampler["negative"] == ["6", 0]
    assert ksampler["latent_image"] == ["7", 0]


def test_widget_values_mapped_to_param_names():
    api = convert_ui_to_api(_ui_graph(), OBJECT_INFO)
    ksampler = api["3"]["inputs"]
    assert ksampler["seed"] == 42
    assert ksampler["steps"] == 20
    assert ksampler["cfg"] == 8.0
    assert ksampler["sampler_name"] == "euler"
    assert ksampler["scheduler"] == "normal"
    assert ksampler["denoise"] == 1.0
    # control_after_generate value must not leak into the API dict
    assert "randomize" not in ksampler.values()
    assert "control_after_generate" not in ksampler


def test_bypass_and_muted_and_reroute_are_transparent():
    api = convert_ui_to_api(_ui_graph(), OBJECT_INFO)
    # reroute node 10 propagates KSampler LATENT to VAEDecode.samples
    assert api["4"]["inputs"]["samples"] == ["3", 0]
    # bypass node 9 propagates CheckpointLoader VAE to VAEDecode.vae
    assert api["4"]["inputs"]["vae"] == ["1", 2]
    # muted node 11 propagates VAEDecode IMAGE to SaveImage.images
    assert api["5"]["inputs"]["images"] == ["4", 0]
    for skipped in ("9", "10", "11", "12", "13"):
        assert skipped not in api


def test_primitive_node_feeds_widget_input():
    api = convert_ui_to_api(_ui_graph(), OBJECT_INFO)
    latent = api["7"]["inputs"]
    # width comes from the primitive (768); remaining widgets shift up
    assert latent["width"] == 768
    assert latent["height"] == 512
    assert latent["batch_size"] == 1


def test_muted_node_without_matching_input_drops_link():
    graph = _ui_graph()
    # muted node 11 gets an input of a different type -> no pass-through
    for node in graph["nodes"]:
        if node["id"] == 11:
            node["inputs"] = [{"name": "mask", "type": "MASK", "link": 14}]
    api = convert_ui_to_api(graph, OBJECT_INFO)
    assert "images" not in api["5"]["inputs"]


def test_missing_nodes_key_raises():
    with pytest.raises(UIConversionError):
        convert_ui_to_api({"1": {"class_type": "KSampler"}}, OBJECT_INFO)


def test_empty_graph_raises():
    with pytest.raises(UIConversionError):
        convert_ui_to_api({"nodes": [], "links": []}, OBJECT_INFO)


def test_unknown_class_type_falls_back(caplog):
    graph = {
        "nodes": [
            {
                "id": 1,
                "type": "TotallyUnknownNode",
                "mode": 0,
                "inputs": [
                    {"name": "value", "type": "INT", "link": None, "widget": {"name": "value"}}
                ],
                "outputs": [],
                "widgets_values": [123],
            }
        ],
        "links": [],
    }
    with caplog.at_level("WARNING"):
        api = convert_ui_to_api(graph, {})
    assert api["1"]["class_type"] == "TotallyUnknownNode"
    assert api["1"]["inputs"].get("value") == 123


def test_dict_widgets_values_supported():
    graph = {
        "nodes": [
            {
                "id": 1,
                "type": "SaveImage",
                "mode": 0,
                "inputs": [],
                "outputs": [],
                "widgets_values": {"filename_prefix": "dict/form"},
            }
        ],
        "links": [],
    }
    api = convert_ui_to_api(graph, OBJECT_INFO)
    assert api["1"]["inputs"]["filename_prefix"] == "dict/form"
