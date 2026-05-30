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

## Phase 6: Agent Skill And OpenClaw Portability

- Ship `openclaw/skills/deck-factory/SKILL.md`.
- Add portable OpenClaw install and configuration instructions.
- Default public docs to local `openclaw`, with `DECK_FACTORY_OPENCLAW_COMMAND` and CLI flags for overrides.
- Define style-name resolution, template/library registration, and output-path conventions.
- Include a cross-skill handoff walkthrough from `skill-deck-handoff.json` to `deck.pptx`.
- Keep the skill fail-closed around missing files, renderers, credentials, stale registries, unknown styles, or QA evidence.
- Add a static skill/package check and a clean-clone smoke path.

## Phase 7: Public Integration Hardening

- Prove a fresh clone can install, build, and run the sample handoff.
- Prove an OpenClaw user can register their own `.pptx` template deck once and reuse it.
- Prove a slide library with `about-us`, `methodology`, and one parameterized slide can be registered and selected by the planner.
- Remove or demote Brian-specific assumptions from public docs.
- Document local deployment overrides separately from public setup.
- Publish the exact supported artifact contract: final `deck.pptx` plus optional internal evidence.

## Phase 8: Slide Template Instructions

- Add a guidance layer that explains what each template layout is for, when to use it, and when to avoid it.
- Add placeholder-level writing contracts for action titles, subtitles, body copy, charts, tables, images, footers, and notes.
- Let the OpenClaw planner compare the originating agent's intended story against the layouts available in the registered template.
- Require each generated slide spec to state why a layout was selected and how each placeholder should be filled.
- Keep extracted template facts separate from editable guidance, likely through a linked `template-instructions.json` sidecar.
- See [slide-template-instructions.md](slide-template-instructions.md) for the feature proposal.

## Phase 9: Production Hardening

- Add a canonical run contract with shared gates, statuses, and severity-coded findings.
- Promote `template-instructions.json` to a first-class sidecar with CLI init/validate/inspect support.
- Validate deck specs against template profiles, layout instructions, placeholder contracts, citations, and asset requirements.
- Emit run evidence: `run-summary.json`, `template-compliance-report.json`, `template-security-report.json`, `runtime-provenance.json`, `source-map.json`, severity-coded `qa-report.json`, and screenshot contact sheets.
- Add a golden-template gauntlet for instruction validation, placeholder compliance, security blockers, and evidence artifacts.
- Keep artifact publishing out of this repo unless a narrow optional interface is added later.

## Sample Templates

Deck Factory should ship sample templates before claiming v0 usability:

- `business-review.pptx`: executive update, metrics, risks, next steps
- `strategy-readout.pptx`: narrative sections, evidence slides, recommendation slides
- `sales-proposal.pptx`: problem, solution, proof, pricing, implementation

Each sample should include dummy slides that demonstrate how users should prepare their own template decks.
