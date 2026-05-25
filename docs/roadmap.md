# Roadmap

## Phase 0: Public Concept

- Define the deck-production contract.
- Document inspiration and prior art.
- Publish the repository.
- Keep the repo honest about its pre-implementation status.

## Phase 1: Minimal Local Pipeline

- Choose the first renderer adapter.
- Define a small `deck-spec.json` schema.
- Add a sample template and sample deck brief.
- Render 3 to 5 editable slides.
- Emit an operation log.

## Phase 2: Template Profiling

- Extract slide size, theme colors, fonts, layouts, placeholders, and masters.
- Save a reusable `template-profile.json`.
- Detect unsupported or missing template features.
- Add fixture templates for regression testing.

## Phase 3: Visual QA

- Rasterize rendered decks to per-slide PNGs.
- Detect out-of-bounds elements and obvious text overflow.
- Add overlap and contrast checks.
- Produce a QA report and slide montage.

## Phase 4: Agent Repair Loop

- Feed QA evidence back into a model.
- Revise deck specs or operation patches.
- Re-render until checks pass or a blocker is reported.
- Preserve every failed attempt for debugging.

## Phase 5: Approval Bundle

- Package the PPTX, screenshots, QA report, source notes, and reviewer summary.
- Add a clear human approval handoff.
- Support repeatable output folders for client projects.

## Phase 6: Agent Skill

- Wrap the workflow as a reusable agent skill.
- Define input and output expectations for Codex, OpenClaw, Claude, Cursor, Gemini, and other agent runners.
- Keep the skill fail-closed around missing files, renderers, credentials, or QA evidence.

## First Implementation Decision

The first technical decision is the renderer adapter. The likely candidates are:

- `pptx-automizer` for template-heavy PowerPoint editing
- `PptxGenJS` for programmatic generation
- `agent-slides` as an agent-native contract to study or wrap

The preferred first pass is to prototype with the smallest adapter that can render editable slides from an existing `.pptx` template while leaving room to swap engines later.
