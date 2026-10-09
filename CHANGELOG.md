# Changelog

All notable changes to ForgeHub are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [0.1.9] — 2026-10-09

### Added
- **Output lightbox** and expanded-prompt trace: the wildcard-resolved prompt is embedded in output metadata and shown next to the worker's final QwenVL prompt under the Prompt section.
- **S3 offload for large outputs** — serverless `s3Config` passthrough with presigned-URL download, sidestepping the ~20 MB gateway cap; credentials configurable from Settings (access id, secret, bucket, region/datacenter).
- **Prompt-target recipe params** — meta params with `target: "prompt"` are appended to the job prompt; bracketed display prefixes (`[CINEMATIC] - ...`) are stripped so the model receives clean prose.
- **MiniMax H3 style dropdown** for Singularity R2VA with `__mmh3/*__` wildcards (`style`, `camera`, `music`, `nsfw`) — `[RANDOM]` expands `__mmh3/style__` directly.
- Bundled `imageio-ffmpeg` in the packaged backend for container metadata embedding on machines without a system ffmpeg.

### Changed
- `vid/*` wildcards migrated to `mmh3/nsfw.yaml`; dropped the obsolete `camera_tag` widget.
- Dropped the Qwen negative prompt.

### Fixed
- **Video output metadata lost on mp4** — ffmpeg silently drops custom tags in mp4 without `-movflags use_metadata_tags`, and no sidecar was written on success; a sidecar `.meta.json` is now always written for containers and ffprobe is located via PATH/common install paths, so the Expanded-prompt trace and history work on video outputs too.

## [0.1.8] — 2026-10-07

### Added
- **MiniMax H3 Singularity R2VA recipe** — turbo 4-step LoRA (`minimax_h3_ref2v_turbo_4step`), 6 steps / Euler / beta scheduler, shift bypassed via `sigma_off` node removal in the API executor.
- **Third reference image support** (`image3`) across QwenVL enhancement + Singularity R2VA workflows — `(S1)`/`(S2)`/`(S3)` subject mapping, with a separate video input.
- **Video upload** for R2VA recipes (reference video input wired through the workflow).
- **`_bypass_nodes` executor support** — recipes can bypass/remove workflow nodes server-side.
- **Unified Pony recipe** (`PimpMyPony-HiResFix-FaceDet`) — wildcards + HiResFix + FaceDetailer in a single workflow; `pmpIncaseStyle` checkpoint option; `None` wildcard preset.
- **Video wildcards** (`vid/*`).
- **Endpoint auto-resolution by name** — recipes declare `endpoint_name` instead of a hardcoded `endpoint_id`; the backend resolves the live endpoint ID from the RunPod account at submit time, picking the most recently created match. Recreating or redeploying endpoints from the RunPod Hub no longer breaks ForgeHub.
- **Outputs panel rework** — hero preview of the latest output with a recent-outputs filmstrip below; media library stays a separate drawer.
- **Prompt trace & history** — wildcard-expanded and final prompts in collapsible boxes under the prompt; history populated from output metadata.
- **Multi-language UI** — English, Italian and Spanish translations; switches instead of on/off dropdowns; advanced fields hidden until the parent feature is enabled; multi-select download in the media library; completion sound; embedded prompt/params metadata in outputs.

### Changed
- Recipe-aware chat behavior and faster warm jobs.
- Output naming: `MMH3_<type>_<date>` prefixes; fixed Pony output pattern (was `Qwen21_`).

### Fixed
- `ModelPreviewOverrideKJ` bypassed in R2VA workflows (missing `taeh3` on the volume).
- Upscaler model links updated to `upscale_models/` path.
- **Endpoint refresh crash on packaged builds** — bundled `certifi` CA data in the PyInstaller backend (`--collect-data certifi`); HTTPS calls to `rest.runpod.io` previously failed with `SSLCertVerificationError`, surfacing as an internal server error on endpoint detection.

## [0.1.5] and earlier

See git history.
