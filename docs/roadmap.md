# Roadmap

## Phase 0: Public Concept

- Define the deck-production contract.
- Document inspiration and prior art.
- Publish the repository.
- Keep the repo honest about its pre-implementation status.

## Phase 1: Minimal Local Pipeline

- Implement the first renderer adapter as a thin layer over `pptx-automizer`.
- Use `PptxGenJS` through the adapter for newly generated dynamic elements.
- Define the first semantic `deck-spec.json` schema.
- Add sample `.pptx` templates and matching deck briefs.
- Render 3 to 5 editable slides.
- Emit an operation log.

## Phase 2: Template Profiling

- Accept user-supplied `.pptx` files with representative dummy slides.
- Extract slide size, theme colors, fonts, layouts, placeholders, and masters.
- Save a reusable `template-profile.json`.
- Detect unsupported or missing template features.
- Add fixture templates for regression testing.

## Phase 3: Visual QA

- Rasterize rendered decks to per-slide PNGs.
- Detect out-of-bounds elements and obvious text overflow.
- Add overlap and contrast checks.
- Add screenshot evaluator review for readability, hierarchy, overcrowding, and template fit.
- Produce a QA report and slide montage.

## Phase 4: Agent Repair Loop

- Feed QA evidence back into a model.
- Revise the deck spec first.
- Patch slide operations only for renderer-specific technical issues.
- Re-render until checks pass or a blocker is reported.
- Preserve every failed attempt for debugging.

## Phase 5: User Handoff

- Deliver `deck.pptx` as the primary user-facing artifact.
- Keep screenshots, QA report, operation log, source spec, and repair attempts as internal build evidence.
- Add an optional approval package only when the user asks for review evidence or when failure evidence is needed.

## Phase 6: Agent Skill

- Wrap the workflow as a reusable agent skill.
- Define input and output expectations for Codex, OpenClaw, Claude, Cursor, Gemini, and other agent runners.
- Keep the skill fail-closed around missing files, renderers, credentials, or QA evidence.

## Sample Templates

Deck Factory should ship sample templates before claiming v0 usability:

- `business-review.pptx`: executive update, metrics, risks, next steps
- `strategy-readout.pptx`: narrative sections, evidence slides, recommendation slides
- `sales-proposal.pptx`: problem, solution, proof, pricing, implementation

Each sample should include dummy slides that demonstrate how users should prepare their own template decks.
