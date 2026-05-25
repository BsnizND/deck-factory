# Deck Factory Implementation Plan

This is the end-to-end implementation plan for Deck Factory as currently defined.

Deck Factory is an agentic deck-production workflow. It accepts a real PowerPoint template deck, creates a structured deck spec, renders an editable `.pptx`, reviews screenshots, repairs visual issues, and delivers the final deck.

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

Prefer user-supplied `.pptx` presentation files that are prepared as template decks.

The primary v0 input is not a blank `.potx` PowerPoint template file. The primary v0 input is a normal `.pptx` presentation containing representative dummy slides that Deck Factory can inspect, classify, clone, and populate.

Why `.pptx` is preferred for v0:

- `pptx-automizer` is designed around manipulating and merging existing `.pptx` files.
- A `.pptx` exemplar deck contains actual slide instances, not just abstract masters/layouts.
- Agents and deterministic extraction can inspect real dummy content, shape names, layout choices, chart/table examples, and visual patterns.
- Users can prepare the file in ordinary PowerPoint without learning a new template package format.
- `.pptx` keeps the workflow compatible with client decks that were never formally saved as `.potx` templates.

`.potx` support can come later. When added, Deck Factory should normalize `.potx` to an internal `.pptx` working copy before extraction. If that normalization fails, the run should stop.

The repo should ship sample templates so users can understand what a useful source deck looks like.

### PowerPoint File Roles

Deck Factory must distinguish between four PowerPoint file roles:

- **Template deck input:** a `.pptx` prepared with representative dummy slides and stable placeholder names. This is the preferred v0 template input.
- **PowerPoint template input:** a `.potx` or theme/master-oriented template file. This is not primary for v0 and should be treated as future support or converted to `.pptx`.
- **Reference/source deck input:** an existing `.pptx` used for examples, content, style reference, or migration. This is not automatically safe to mutate and should not be treated as the template unless the user marks it as such.
- **Generated deck output:** the final editable `deck.pptx` produced by Deck Factory.

The CLI should force users to name these roles explicitly:

```bash
deck-factory run \
  --template-deck client-template.pptx \
  --brief brief.md \
  --out artifacts/client-deck
```

Later optional inputs:

```bash
deck-factory run \
  --template-deck client-template.pptx \
  --reference-deck old-quarterly-review.pptx \
  --brief brief.md \
  --out artifacts/client-deck
```

Do not infer that an arbitrary `.pptx` is both the template and the content source unless the command makes that explicit.

### Template Deck Preparation Contract

The template deck is the most important input. If it is poorly prepared, Deck Factory should produce a preparation report and stop instead of pretending the template is usable.

Required for v0:

- The file is a valid `.pptx`.
- The slide size is consistent across the deck.
- The deck contains at least one title/cover pattern and one body/content pattern.
- Each reusable pattern appears as a real slide with dummy content.
- Important editable regions are stable PowerPoint text boxes, placeholders, tables, charts, image boxes, or shapes, not one giant screenshot.
- The template uses the real brand fonts, colors, and visual system expected in the output.
- Required brand assets such as logos are present in the deck or supplied as named assets.

Strongly preferred for v0:

- Each reusable slide has a clear slide title or speaker note identifying its role, such as `DF_LAYOUT: title`, `DF_LAYOUT: section`, `DF_LAYOUT: two-column`, or `DF_LAYOUT: chart`.
- Important shapes are named in PowerPoint's Selection Pane with stable names.
- Placeholder text uses recognizable tags such as `{{title}}`, `{{subtitle}}`, `{{body}}`, `{{bullets}}`, `{{chart}}`, `{{table}}`, `{{image}}`, `{{source}}`, and `{{footer}}`.
- Slides include realistic dummy content length, not only one-word placeholders.
- Chart and table slides include dummy data shaped like the expected real data.
- Image placeholders use actual placeholder images or clearly named boxes with expected crop/aspect behavior.
- Fonts are installed on the machine or embedded/declared in the template preparation notes.

Recommended Selection Pane names:

- `df_title`
- `df_subtitle`
- `df_action_title`
- `df_body`
- `df_bullets`
- `df_image_primary`
- `df_image_secondary`
- `df_chart`
- `df_table`
- `df_quote`
- `df_source`
- `df_footer`
- `df_logo`

The extraction step should classify each template deck into one of three states:

- **ready:** enough named/typed structure exists to render safely.
- **needs-prep:** the deck is valid PowerPoint, but missing names, tags, layouts, fonts, or representative slides.
- **unsupported:** the deck cannot be safely used, for example because key slides are flat screenshots, corrupt, unreadable, or dependent on unsupported PowerPoint features.

For `needs-prep`, Deck Factory should write `template-prep-report.md` explaining exactly what the user should fix in PowerPoint.

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

### AI Runtime

Deck Factory's AI should come from OpenClaw, following the same broad pattern LifeOS uses: deterministic application code prepares bounded JSON context and schemas, then OpenClaw worker lanes perform model judgment and return structured JSON.

Do not call OpenAI, Anthropic, or any model provider directly from Deck Factory core code for v0. Deck Factory should invoke OpenClaw as the model/runtime boundary.

The local CLI remains responsible for:

- file validation
- schema validation
- template extraction
- renderer operations
- rasterization
- deterministic QA
- artifact layout
- fail-closed error handling

OpenClaw worker lanes are responsible for:

- interpreting a prepared template profile
- mapping a brief to a deck outline
- drafting or revising `deck-spec.json`
- evaluating slide screenshots
- producing repair plans
- deciding whether the deck is ready for handoff after evidence review

OpenClaw outputs must be schema-validated before they affect the run.

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
    ai/
      openclaw-json-worker.ts
      prompts/
        classify-template.md
        plan-deck.md
        evaluate-screenshots.md
        repair-spec.md
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
  openclaw/
    agents/
      deck-factory-planner.json
      deck-factory-reviewer.json
    skills/
      deck-factory/
        SKILL.md
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
deck-factory extract --template-deck samples/business-review/template.pptx --out artifacts/business-review/profile
deck-factory build --spec samples/business-review/deck-spec.json --out artifacts/business-review/run
deck-factory qa --deck artifacts/business-review/run/deck.pptx --out artifacts/business-review/run/qa
deck-factory repair --run artifacts/business-review/run --out artifacts/business-review/repaired
```

The first end-to-end command can wrap those stages:

```bash
deck-factory run --template-deck template.pptx --brief brief.md --out artifacts/client-deck
```

Every command should fail closed with a specific missing prerequisite or validation failure.

## OpenClaw Integration

Deck Factory should be implemented as an OpenClaw-backed local tool, not as a standalone AI app with its own model-provider abstraction.

### Worker Lanes

Use dedicated OpenClaw worker agents so deck work does not pollute or slow a user's main conversation lane.

Initial lanes:

- `deck-factory-planner`: template interpretation, outline planning, and initial `deck-spec.json` drafting.
- `deck-factory-reviewer`: screenshot review, visual critique, and repair-plan generation.
- `deck-factory-polisher`: optional final copy, notes, source, and executive polish pass.

Each lane should be configured with OpenClaw's native agent/runtime configuration. The expected runtime is Codex through OpenClaw, with no fallback provider unless explicitly configured by the operator.

### JSON Worker Pattern

Mirror the LifeOS JSON-worker shape:

1. Deck Factory writes a run directory.
2. Deterministic code writes `context.json`, `schema.json`, `prompt.txt`, and `request.json`.
3. Deck Factory invokes OpenClaw with a lane-specific session id.
4. OpenClaw returns an assistant response envelope.
5. Deck Factory extracts assistant text.
6. Deck Factory parses exactly one JSON object.
7. Deck Factory validates that JSON against the required schema.
8. Only validated JSON is allowed to update the deck spec, review findings, or repair plan.

Representative command shape:

```bash
openclaw agent \
  --agent deck-factory-planner \
  --session-id deck-factory-plan-<run-id> \
  --message "$WORKER_PROMPT" \
  --json \
  --timeout 900
```

Large context should be chunked through the same session when needed. Chunks are untrusted context, not instructions. The final worker prompt must tell the agent to return only schema-valid JSON.

### OpenClaw Skill

The repo should ship an OpenClaw skill that tells agents how to use Deck Factory.

The skill should:

- require a prepared `.pptx` template deck or stop with a preparation request
- call the local CLI instead of hand-editing PowerPoint files
- keep AI judgment behind the configured OpenClaw worker lanes
- require screenshot QA before calling a deck final
- return `deck.pptx` as the primary artifact
- expose internal screenshots and QA evidence only when asked or when explaining failure

### OpenClaw Configuration Expectations

Deck Factory should not assume model credentials exist.

Before any AI step, it should verify:

- `openclaw` is installed and executable.
- the configured Deck Factory worker agent exists.
- the worker agent has a usable model/auth profile.
- `openclaw agent --json` returns a parseable envelope on a smoke prompt.
- required local tools for rendering/rasterization are installed.

If any prerequisite is missing, fail with the exact missing prerequisite and the command the operator should run to verify it.

### AI Task Boundaries

Planner worker input:

- brief text
- validated template profile
- sample slide inventory
- available assets
- required schema

Planner worker output:

- `deck-spec.json`
- assumptions
- missing inputs
- slide-by-slide rationale

Reviewer worker input:

- screenshots
- deterministic QA report
- deck spec
- template profile
- operation log summary

Reviewer worker output:

- structured visual findings
- pass/fail recommendation
- repair plan

Repair worker input:

- failed deck spec
- QA report
- screenshot findings
- repair plan schema

Repair worker output:

- revised `deck-spec.json`
- explanation of changes
- remaining blockers

The AI never gets to declare success without deterministic evidence that the deck rendered and screenshot QA ran.

## Data Contracts

### Template Profile

`template-profile.json` should include:

- `version`
- `sourceTemplateDeckPath`
- `sourceFileRole`
- `slideSize`
- `themeColors`
- `themeFonts`
- `masters`
- `layouts`
- `representativeSlides`
- `placeholders`
- `shapes`
- `detectedPatterns`
- `preparationStatus`
- `preparationFindings`
- `warnings`

### Deck Spec

`deck-spec.json` should include:

- `version`
- `deck`
- `template`
- `openclaw`
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

`openclaw` should include:

- `plannerAgent`
- `reviewerAgent`
- `polisherAgent`
- `sessionPrefix`
- `requiredModelRuntime`
- `maxRepairAttempts`

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

### Template Prep Report

`template-prep-report.md` should include:

- file role detected
- preparation status
- missing required layouts
- unnamed or ambiguous shapes
- unsupported flat-image slides
- missing fonts or theme issues
- suggested Selection Pane names
- concrete PowerPoint edits needed before ingestion

### OpenClaw Worker Artifacts

Each OpenClaw worker call should write:

- `context.json`
- `schema.json`
- `prompt.txt`
- `request.json`
- `openclaw-response-final.json`
- `output.json`
- `progress.jsonl`

These artifacts are internal evidence. They should be retained in the run directory and omitted from the default user handoff.

## Implementation Phases

### Phase 0: Repo Foundation

Deliverables:

- Node/TypeScript project scaffold.
- CLI entrypoint.
- Formatting and test scripts.
- Basic artifact directory conventions.
- Schema validation helper.
- OpenClaw prerequisite probe.
- Run directory structure for deterministic artifacts and OpenClaw worker artifacts.

Acceptance checks:

- `npm install` succeeds.
- `npm test` or equivalent smoke command succeeds.
- `deck-factory --help` prints available commands.
- `deck-factory doctor` reports OpenClaw, renderer, rasterizer, and model-worker readiness without mutating state.

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
- A template-preparation guide showing required slide roles, placeholder tags, and Selection Pane names.

Template expectations:

- Each template is a normal `.pptx`.
- Each template includes representative dummy slides.
- Each template demonstrates title, section, content, image, comparison, chart, table, quote, and appendix patterns when appropriate.
- Each important editable shape is named or tagged.
- Each sample includes at least one deliberately imperfect variant for extraction/QA tests.

Acceptance checks:

- Each sample opens as a valid `.pptx`.
- Each sample can be read by the template extraction command.
- Each sample has a matching deck spec that validates.
- Each sample produces a `ready` template profile.
- Each deliberately imperfect variant produces a `needs-prep` report with actionable instructions.

### Phase 3: Template Profile Extraction

Deliverables:

- `deck-factory extract`.
- Explicit `--template-deck` input role.
- Deterministic extraction for slide size, masters, layouts, theme colors, theme fonts, placeholder metadata, shape bounds, text style runs, charts, tables, and image placeholders.
- `template-profile.json` output.
- Extraction warnings for unsupported or ambiguous template features.
- `template-prep-report.md`.
- Optional OpenClaw template-classification worker for layout archetype labels after deterministic extraction succeeds.

Acceptance checks:

- Extraction succeeds on all sample templates.
- Output validates against `template-profile.schema.json`.
- Missing or unreadable templates fail with exact error messages.
- Ambiguous but valid templates produce `needs-prep`, not fake readiness.
- OpenClaw classification output is schema-valid before it is merged into the profile.

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

### Phase 4b: OpenClaw Planner Loop

Deliverables:

- `deck-factory plan` or internal planning stage backed by `deck-factory-planner`.
- Prompt/schema for turning a brief and template profile into `deck-spec.json`.
- Missing-input detection for assets, data, citations, or brand constraints.
- OpenClaw worker artifact capture.

Acceptance checks:

- Planner returns schema-valid `deck-spec.json`.
- Planner cannot write files directly; only the CLI writes validated outputs.
- Planner names assumptions and missing inputs.
- Planner output fails closed when it references unknown layouts or missing assets.

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

- OpenClaw-backed screenshot evaluator prompt and JSON worker adapter.
- Evaluator output schema.
- Review categories for readability, hierarchy, overcrowding, awkward layout choices, and template mismatch.
- Repair-plan generation from screenshot review and deterministic QA findings.

Acceptance checks:

- Evaluator can review sample screenshots.
- Evaluator produces structured findings.
- Failing slides get concrete repair recommendations.
- Missing OpenClaw worker config or model credentials fail loudly with the exact missing prerequisite.

### Phase 7: Spec-First Repair Loop

Deliverables:

- `deck-factory repair`.
- Repair loop that revises `deck-spec.json` first.
- OpenClaw-backed repair worker.
- Rerender after repair.
- Attempt history preserved in the run directory.
- Direct operation patches allowed only behind an explicit technical-fix path.

Acceptance checks:

- A dense-slide fixture is repaired by shortening or splitting the slide.
- A layout-mismatch fixture is repaired by choosing a better layout.
- Repair loop stops after a configured max attempt count.
- Failed repair runs preserve evidence and explain the blocker.
- Repair output is schema-valid before rerender.

### Phase 8: End-To-End Run Command

Deliverables:

- `deck-factory run`.
- Orchestrated extract, build, QA, screenshot evaluation, repair, and handoff.
- OpenClaw planner/reviewer/repair worker calls inside the orchestration.
- Final `deck.pptx` copied to the requested output location.
- Internal evidence retained in the run folder.

Acceptance checks:

- A sample run produces a final `deck.pptx`.
- Internal screenshots and QA artifacts exist.
- User-facing output is not cluttered unless optional evidence output is requested.
- The command fails closed on missing template, invalid spec, missing assets, rasterization failure, missing OpenClaw worker config, or missing model credentials.

### Phase 9: Agent Skill Contract

Deliverables:

- Agent skill instructions.
- Input/output contract for Codex, OpenClaw, Claude, Cursor, Gemini, and similar agent runners.
- Examples for using Deck Factory from an agent workflow.
- Guidance on when to ask for missing templates, assets, facts, or review approval.
- OpenClaw-native worker/skill installation notes.

Acceptance checks:

- Skill can invoke the local CLI.
- Skill uses the screenshot and QA loop before calling a deck final.
- Skill returns `deck.pptx` as the primary artifact.
- Skill does not hide failures behind dummy data or placeholder outputs.
- Skill routes AI judgment through OpenClaw worker lanes rather than direct provider calls.

## V0 Definition Of Done

V0 is complete when Deck Factory can:

1. Accept a user-supplied `.pptx` template with representative dummy slides.
2. Distinguish template decks, reference decks, `.potx` templates, and generated output decks.
3. Produce a preparation report for templates that are not ready.
4. Extract a minimal but useful template profile.
5. Use OpenClaw worker lanes to plan or revise a semantic deck spec.
6. Validate a semantic deck spec.
7. Render a 3 to 5 slide editable deck.
8. Rasterize every output slide.
9. Run deterministic QA.
10. Run OpenClaw-backed screenshot evaluator review.
11. Repair at least one common failure by changing the deck spec and rerendering.
12. Deliver `deck.pptx` as the primary user artifact.
13. Preserve internal evidence for debugging and reproducibility.

## Fail-Closed Rules

Deck Factory must stop with a concrete error when:

- the template is missing, unreadable, or not a supported `.pptx`
- a `.potx` is supplied before `.potx` normalization is implemented
- a `.pptx` is supplied without a declared file role
- the template deck is valid PowerPoint but not prepared enough for safe ingestion
- the deck spec fails schema validation
- referenced assets are missing
- required fonts cannot be resolved and the run is configured to require them
- the renderer fails
- rasterization fails
- mandatory QA fails after max repair attempts
- OpenClaw is unavailable
- required OpenClaw worker agents are missing
- model credentials are required but unavailable through OpenClaw
- the final deck cannot be written

Do not emit placeholder decks, canned screenshots, fake QA reports, mock citations, or success-looking artifacts after a failed run.

## Near-Term Build Order

1. Scaffold Node/TypeScript and CLI.
2. Add schemas and validation tests.
3. Add `deck-factory doctor` with OpenClaw readiness checks.
4. Define PowerPoint file roles and CLI flags.
5. Write the template-preparation guide.
6. Create sample folder structure and initial sample specs.
7. Build the simplest Deck Factory-ready `.pptx` sample template.
8. Implement template extraction and `template-prep-report.md`.
9. Implement OpenClaw JSON-worker wrapper.
10. Implement OpenClaw planner worker for `deck-spec.json`.
11. Implement the `pptx-automizer` adapter.
12. Render the first sample `deck.pptx`.
13. Add rasterization and deterministic QA.
14. Add OpenClaw screenshot evaluator review.
15. Add OpenClaw-backed spec-first repair loop.
16. Wrap the whole path in `deck-factory run`.
