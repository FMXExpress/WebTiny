# WebTiny

A dependency-free JavaScript port of [TINY 2.1](https://github.com/WollyMonjac/Tiny-2.1), with a responsive chat interface. The unchanged TINY.BIN is bundled and loaded automatically. A module Web Worker performs all inference locally using typed arrays, float32 rounding, int8 KV caches, RMS normalization, attention, and temperature sampling.

Serve `dist/` over HTTP or HTTPS using any static host (for example `python3 -m http.server 8080 --directory dist`). Open localhost:8080. Modern browsers supporting ES modules and module Web Workers are required. No WebGPU, API key, package installation, or backend is required. The page initially downloads its assets; Google Fonts are optional, with system font fallbacks. Questions stay in the browser.

Features: streamed generation, cancellation (Stop or Escape), saved conversations in localStorage, new conversation (Ctrl/Cmd K), text export, copy answers, live activity/confidence/speed, creativity 0–9, and local replacement model loading. Original constraints apply: 72 printable ASCII question characters and 128 total context positions. Each question is independent: saved conversation history is visual and is not fed back into this small model.

## Verification

`npm test` runs the 60 reference questions at creativity 0, plus damaged-model rejection, input cleanup, and stochastic-sampling checks. `tests/reference.json` was captured from the upstream C program compiled with GCC -O2. Answers match all 60 reference outputs. This preserves the original model's incorrect answers as well as its correct ones.

Run `node tests/dataset.test.mjs` for dataset-tool checks, and see `training/README.md` for the Python trainer.

## Attribution

Original model and architecture: WollyMonjac/Tiny-2.1. The upstream repository has no license file at the revision reviewed. The repository LICENSE applies to original WebTiny contributions; it does not grant rights to upstream materials. The bundled `dist/TINY.BIN` is the unchanged upstream model. See THIRD_PARTY_NOTICES.md.

## WebTiny Dataset Studio

Open `http://localhost:8080/dataset.html` to create and edit your own training records locally. It supports JSONL, JSON arrays/project backups, and RFC-style quoted CSV with `question,answer` headers. Optional `fact_id`, `category`, and `source` fields preserve grouping and provenance. Imports append records; importing a project into an empty workspace also restores split settings. Existing content is never silently replaced. Undo reverses the last record/import mutation. Local browser storage is a convenience; use Save project for portable backups.

All records must pass validation before training ZIP export: nonempty printable ASCII, question length at most 72, question + separator + answer at most 128, no edge whitespace, no duplicate normalized questions or conflicting labels. Imported invalid records remain editable and appear under Needs attention. Validation checks structure and consistency, not factual correctness.

Splits are deterministic for a fixed dataset and seed. Records with the same fact ID stay together; assign that ID yourself to related paraphrases. Split percentages are approximate by group; empty held-out splits are possible with small datasets. Changing group membership may change its split. Exports include train/validation/test JSONL, source metadata CSV, a complete project backup, and a training command. The trainer runs in Python separately; the editor does not generate examples or train a model. Run `node tests/dataset.test.mjs` for parser, validation, grouping, and independently checked ZIP tests.

## Training kit download

Run `python scripts/package_training_kit.py` to build `dist/training-kit.zip` for the download links in the browser app. It includes source, tests, and training instructions.

## Switch inference engines

The Neural Monitor includes **Inference engine**: JavaScript (default) or Pascal compiled with pas2js. Both run on the CPU, use the same model, stream answers, and drive the same monitor. You can switch while idle, including after loading a custom model.

Pascal source and build instructions are in [pascal/README.md](pascal/README.md). The generated JavaScript is committed. `npm test` includes cross-engine parity and worker-switching checks. `npm run benchmark` reruns the comparison; see [benchmarks/README.md](benchmarks/README.md) for measurements and limitations. In this Node test, inference speed was effectively tied; the hand-written JavaScript engine is considerably smaller.

### Robot voice

After a complete answer, WebTiny plays the original Tiny PC-speaker letter effect and highlights each word in time. Both inference engines use the same local Web Audio player. Press any key to stop playback or clear **Robot voice** in the monitor to turn it off. The setting is saved in this browser.
