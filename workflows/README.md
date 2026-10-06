# Workflow catalog

Ogni voce è una coppia:

- `<name>.json` — il workflow. In **modalità serverless** può essere uno stub
  `{}`: il grafo vero vive sull'endpoint in `/opt/workflows` e viene scelto da
  `remote_file` nel meta. In **modalità direct** serve l'export in formato API
  di ComfyUI (Save → Export API), non il formato canvas.
- `<name>.meta.json` — metadati + parametri esposti al form.

## Schema parametri

```json
{"key": "prompt", "label": "Prompt", "type": "text", "target": "job"}
```

- `type`: `text` | `int` | `float` | `select` (con `options`) | `images` (con `max`) | `video`
- `target: "job"` → campo top-level dell'input del job serverless
  (`prompt`, `config`, `camera_tag`, `seconds`, `images`, `video`)
- `target: "node:<id>:<widget>"` → patch sul grafo (direct) o `params` (serverless)
- `handler` / `remote_file`: marcatura endpoint e nome file remoto.
