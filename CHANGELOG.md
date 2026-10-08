# Changelog

All notable changes to ForgeHub are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [0.1.8] — 2026-10-07

### Added
- **MiniMax H3 Singularity R2VA recipe** — turbo 4-step LoRA (`minimax_h3_ref2v_turbo_4step`), 6 steps / Euler / beta scheduler, shift bypassed via `sigma_off` node removal in the API executor.
- **Third reference image support** (`image3`) across QwenVL enhancement + Singularity R2VA workflows — `(S1)`/`(S2)`/`(S3)` subject mapping, with a separate video input.
- **Video upload** for R2VA recipes (reference video input wired through the workflow).
- **`_bypass_nodes` executor support** — recipes can bypass/remove workflow nodes server-side.
- **Unified Pony recipe** (`PimpMyPony-HiResFix-FaceDet`) — wildcards + HiResFix + FaceDetailer in a single workflow; `pmpIncaseStyle` checkpoint option; `None` wildcard preset.
- **Video wildcards** (`vid/*`).

### Changed
- Recipe-aware chat behavior and faster warm jobs.
- Output naming: `MMH3_<type>_<date>` prefixes; fixed Pony output pattern (was `Qwen21_`).

### Added
- **Endpoint auto-resolution by name** — recipes declare `endpoint_name` instead of a hardcoded `endpoint_id`; the backend resolves the live endpoint ID from the RunPod account at submit time, picking the most recently created match. Recreating or redeploying endpoints from the RunPod Hub no longer breaks ForgeHub.

### Fixed
- `ModelPreviewOverrideKJ` bypassed in R2VA workflows (missing `taeh3` on the volume).
- Upscaler model links updated to `upscale_models/` path.
- **Endpoint refresh crash on packaged builds** — bundled `certifi` CA data in the PyInstaller backend (`--collect-data certifi`); HTTPS calls to `rest.runpod.io` previously failed with `SSLCertVerificationError`, surfacing as an internal server error on endpoint detection.

## [0.1.5] and earlier

See git history.
