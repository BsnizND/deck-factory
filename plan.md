# Deck Factory Implementation Plan

This is the end-to-end implementation plan for Deck Factory as currently defined.

Deck Factory is an agentic deck-production workflow. It accepts a real PowerPoint template, creates a structured deck spec, renders an editable `.pptx`, reviews screenshots, repairs visual issues, and delivers the final deck.

The product goal is not to invent a new PowerPoint engine. The goal is to orchestrate existing rendering tools, deterministic validation, and model judgment into a reliable workflow for agency/client deck production.

## Product Contract

```text
template.pptx
  -> template profile
  -> deck spec
  -> renderer operations
  -> editable deck.pptx
  -> slide screenshots
  -> deterministic QA
  -> screenshot evaluator loop
  -> repaired deck.pptx
  -> user handoff
```

## Architecture Decisions

### Renderer

Use a thin Deck Factory adapter over `pptx-automizer`.

Use `PptxGenJS` through that adapter when new dynamic elements are required. Do not write a custom PPTX renderer for v0. Do not fork renderer internals unless documented APIs cannot support a required behavior and the direction is explicitly approved.

Study `agent-slides` as reference architecture for extraction, validation, CLI ergonomics, and agent workflows, but do not make it the core dependency for v0.

### Template Input

Accept user-supplied `.pptx` files with representative dummy slides.

Users should be able to bring a normal PowerPoint deck that contains the layouts they expect Deck Factory to reuse. `.potx` support can be added later if the renderer stack handles it cleanly.

The repo should ship sample templates so users can understand what a useful source deck looks like.

### Deck Spec

The v0 deck spec should be semantic, not pixel-positioned.

It should describe the deck's intent, template reference, assets, ordered slides, content blocks, citations, and constraints. The renderer adapter translates semantic blocks into concrete placement using the extracted template profile.

### Template Extraction

Use deterministic code to extract PowerPoint facts. Use the agent to interpret those facts.

Deterministic extraction creates evidence: slide size, masters, layouts, fonts, colors, placeholder bounds, shape metadata, and representative dummy-slide styles.

Agent interpretation makes design judgments: layout archetypes, content roles, slide selection, copy shortening, slide splitting, and screenshot-based visual critique.

### QA And Repair

V0 requires both deterministic QA and a screenshot evaluator loop.

The repair loop should rewrite the deck spec first. Treat renderer operations as generated output. Patch operations directly only for renderer-specific technical issues that cannot be represented cleanly in the spec.

### User Handoff

The user-facing artifact is the deck:

```text
deck.pptx
```

Screenshots, QA reports, operation logs, source specs, and repair attempts are internal build evidence by default. Include them in a handoff only when the user asks for review evidence or when failure evidence is needed.

## Target Repository Shape

```text
deck-factory/
  plan.md
  README.md
  package.json
  tsconfig.json
  src/
    cli/
      index.ts
      commands/
        build.ts
        extract.ts
        qa.ts
        repair.ts
    schema/
      deck-spec.schema.json
      template-profile.schema.json
      qa-report.schema.json
      types.ts
      validate.ts
    template/
      extract-template-profile.ts
      classify-layouts.ts
    render/
      renderer-adapter.ts
      pptx-automizer-adapter.ts
      operations-log.ts
    qa/
      rasterize.ts
      deterministic-checks.ts
      screenshot-evaluator.ts
      repair-plan.ts
    workflow/
      build-deck.ts
      repair-loop.ts
      handoff.ts
  samples/
    business-review/
      template.pptx
      brief.md
      deck-spec.json
    strategy-readout/
      template.pptx
      brief.md
      deck-spec.json
    sales-proposal/
      template.pptx
      brief.md
      deck-spec.json
  artifacts/
    .gitkeep
  docs/
    architecture.md
    decisions.md
    idea.md
    roadmap.md
```

## Command Surface

The CLI should be small and composable:

```bash
deck-factory extract --template samples/business-review/template.pptx --out artifacts/business-review/profile
deck-factory build --spec samples/business-review/deck-spec.json --out artifacts/business-review/run
deck-factory qa --deck artifacts/business-review/run/deck.pptx --out artifacts/business-review/run/qa
deck-factory repair --run artifacts/business-review/run --out artifacts/business-review/repaired
```

The first end-to-end command can wrap those stages:

```bash
deck-factory run --template template.pptx --brief brief.md --out artifacts/client-deck
```

Every command should fail closed with a specific missing prerequisite or validation failure.

## Data Contracts

### Template Profile

`template-profile.json` should include:

- `version`
- `sourceTemplatePath`
- `slideSize`
- `themeColors`
- `themeFonts`
- `masters`
- `layouts`
- `representativeSlides`
- `placeholders`
- `shapes`
- `detectedPatterns`
- `warnings`

### Deck Spec

`deck-spec.json` should include:

- `version`
- `deck`
- `template`
- `assets`
- `slides`
- `constraints`

`deck` should include:

- `title`
- `audience`
- `objective`
- `tone`
- `requestedLength`
- `speakerNotes`

Each slide should include:

- `id`
- `layout`
- `purpose`
- `title`
- `actionTitle`
- `content`
- `speakerNotes`
- `citations`
- `constraints`

Supported v0 content block types:

- `text`
- `bullets`
- `image`
- `chart`
- `table`
- `quote`
- `callout`
- `divider`
- `footer`

### Operation Log

`operations.jsonl` should include one JSON object per renderer operation:

- operation id
- slide id
- source spec path
- template layout used
- renderer action
- inputs
- warnings
- output shape ids when available

### QA Report

`qa-report.json` should include:

- render status
- slide count match
- rasterization status
- missing assets
- text overflow findings
- clipping findings
- out-of-bounds findings
- overlap findings
- font substitution warnings
- contrast warnings
- screenshot evaluator notes
- pass/fail status

## Implementation Phases

### Phase 0: Repo Foundation

Deliverables:

- Node/TypeScript project scaffold.
- CLI entrypoint.
- Formatting and test scripts.
- Basic artifact directory conventions.
- Schema validation helper.

Acceptance checks:

- `npm install` succeeds.
- `npm test` or equivalent smoke command succeeds.
- `deck-factory --help` prints available commands.

### Phase 1: Schema And Fixtures

Deliverables:

- `deck-spec.schema.json`.
- `template-profile.schema.json`.
- `qa-report.schema.json`.
- TypeScript types generated or maintained from schemas.
- One hand-authored sample `deck-spec.json`.
- Placeholder sample template directories.

Acceptance checks:

- Valid sample specs pass schema validation.
- Invalid sample specs fail with useful errors.
- Schema tests cover required fields and unknown content block types.

### Phase 2: Sample Templates

Deliverables:

- `business-review.pptx`.
- `strategy-readout.pptx`.
- `sales-proposal.pptx`.
- Matching briefs and deck specs.
- Template authoring guidance in each sample folder.

Template expectations:

- Each template is a normal `.pptx`.
- Each template includes representative dummy slides.
- Each template demonstrates title, section, content, image, comparison, chart, table, quote, and appendix patterns when appropriate.

Acceptance checks:

- Each sample opens as a valid `.pptx`.
- Each sample can be read by the template extraction command.
- Each sample has a matching deck spec that validates.

### Phase 3: Template Profile Extraction

Deliverables:

- `deck-factory extract`.
- Deterministic extraction for slide size, masters, layouts, theme colors, theme fonts, placeholder metadata, shape bounds, text style runs, charts, tables, and image placeholders.
- `template-profile.json` output.
- Extraction warnings for unsupported or ambiguous template features.

Acceptance checks:

- Extraction succeeds on all sample templates.
- Output validates against `template-profile.schema.json`.
- Missing or unreadable templates fail with exact error messages.

### Phase 4: Renderer Adapter

Deliverables:

- Thin `pptx-automizer` adapter.
- Semantic block to renderer-operation mapping.
- `PptxGenJS` usage through the adapter for generated charts, tables, shapes, or text blocks where needed.
- `operations.jsonl`.
- First editable `deck.pptx` output.

Acceptance checks:

- Build command renders a 3 to 5 slide deck from a sample spec.
- Output is an editable `.pptx`.
- Operation log records slide-level actions.
- Missing assets, unknown layouts, or renderer failures stop the run.

### Phase 5: Rasterization And Deterministic QA

Deliverables:

- PPTX-to-PNG rasterization for every slide.
- Deterministic checks for slide count, missing assets, text overflow, clipping, out-of-bounds shapes, severe overlaps, font substitution, and basic contrast.
- `qa-report.json`.

Acceptance checks:

- Every rendered slide has a PNG.
- QA report validates against schema.
- Known bad fixtures produce failing QA reports.
- Known good sample decks pass deterministic QA.

### Phase 6: Screenshot Evaluator Loop

Deliverables:

- Screenshot evaluator prompt and adapter.
- Evaluator output schema.
- Review categories for readability, hierarchy, overcrowding, awkward layout choices, and template mismatch.
- Repair-plan generation from screenshot review and deterministic QA findings.

Acceptance checks:

- Evaluator can review sample screenshots.
- Evaluator produces structured findings.
- Failing slides get concrete repair recommendations.
- Missing model credentials fail loudly with the exact missing prerequisite.

### Phase 7: Spec-First Repair Loop

Deliverables:

- `deck-factory repair`.
- Repair loop that revises `deck-spec.json` first.
- Rerender after repair.
- Attempt history preserved in the run directory.
- Direct operation patches allowed only behind an explicit technical-fix path.

Acceptance checks:

- A dense-slide fixture is repaired by shortening or splitting the slide.
- A layout-mismatch fixture is repaired by choosing a better layout.
- Repair loop stops after a configured max attempt count.
- Failed repair runs preserve evidence and explain the blocker.

### Phase 8: End-To-End Run Command

Deliverables:

- `deck-factory run`.
- Orchestrated extract, build, QA, screenshot evaluation, repair, and handoff.
- Final `deck.pptx` copied to the requested output location.
- Internal evidence retained in the run folder.

Acceptance checks:

- A sample run produces a final `deck.pptx`.
- Internal screenshots and QA artifacts exist.
- User-facing output is not cluttered unless optional evidence output is requested.
- The command fails closed on missing template, invalid spec, missing assets, rasterization failure, or missing model credentials.

### Phase 9: Agent Skill Contract

Deliverables:

- Agent skill instructions.
- Input/output contract for Codex, OpenClaw, Claude, Cursor, Gemini, and similar agent runners.
- Examples for using Deck Factory from an agent workflow.
- Guidance on when to ask for missing templates, assets, facts, or review approval.

Acceptance checks:

- Skill can invoke the local CLI.
- Skill uses the screenshot and QA loop before calling a deck final.
- Skill returns `deck.pptx` as the primary artifact.
- Skill does not hide failures behind dummy data or placeholder outputs.

## V0 Definition Of Done

V0 is complete when Deck Factory can:

1. Accept a user-supplied `.pptx` template with representative dummy slides.
2. Extract a minimal but useful template profile.
3. Validate a semantic deck spec.
4. Render a 3 to 5 slide editable deck.
5. Rasterize every output slide.
6. Run deterministic QA.
7. Run screenshot evaluator review.
8. Repair at least one common failure by changing the deck spec and rerendering.
9. Deliver `deck.pptx` as the primary user artifact.
10. Preserve internal evidence for debugging and reproducibility.

## Fail-Closed Rules

Deck Factory must stop with a concrete error when:

- the template is missing, unreadable, or not a supported `.pptx`
- the deck spec fails schema validation
- referenced assets are missing
- required fonts cannot be resolved and the run is configured to require them
- the renderer fails
- rasterization fails
- mandatory QA fails after max repair attempts
- model credentials are required but unavailable
- the final deck cannot be written

Do not emit placeholder decks, canned screenshots, fake QA reports, mock citations, or success-looking artifacts after a failed run.

## Near-Term Build Order

1. Scaffold Node/TypeScript and CLI.
2. Add schemas and validation tests.
3. Create sample folder structure and initial sample specs.
4. Build the simplest `.pptx` sample template.
5. Implement template extraction.
6. Implement the `pptx-automizer` adapter.
7. Render the first sample `deck.pptx`.
8. Add rasterization and deterministic QA.
9. Add screenshot evaluator review.
10. Add spec-first repair loop.
11. Wrap the whole path in `deck-factory run`.
