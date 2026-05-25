# Deck Factory Implementation Plan

This is the end-to-end implementation plan for Deck Factory as currently defined.

Deck Factory is an agentic deck-production workflow. It accepts a real PowerPoint template deck, creates a structured deck spec, renders an editable `.pptx`, reviews screenshots, repairs visual issues, and delivers the final deck.

The product goal is not to invent a new PowerPoint engine. The goal is to orchestrate existing rendering tools, deterministic validation, and model judgment into a reliable workflow for agency/client deck production.

For the ready-to-execute remaining-work sequence, use [docs/execution-plan.md](docs/execution-plan.md). That file turns this product plan into ordered implementation work packages and acceptance gates.

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

The repo ships sample templates so users can understand what a useful source deck looks like.

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

### Template Registry And Style Packs

Deck Factory must not re-extract the same template every time a user asks for a deck.

Templates should be registered once, extracted once, and reused by stable style names. A user should be able to say "Snizco Agency style" and Jay should resolve that to a cached template profile, not start from raw PowerPoint extraction again.

The template registry should store:

- template id, such as `snizco-agency`
- display name, such as `Snizco Agency`
- source template deck path
- content hash of the source `.pptx`
- extractor version
- profile schema version
- extracted template profile path
- template preparation status
- supported deck/report archetypes
- preferred slide layouts by semantic use
- brand/style notes
- last extracted timestamp

Extraction should happen only when:

- a template is registered for the first time
- the source `.pptx` content hash changes
- the extractor version changes
- the template-profile schema version changes
- the user explicitly runs `deck-factory templates refresh`

If none of those are true, Deck Factory must reuse the cached profile.

The registry should support both global and project-local scopes:

- global registry: reusable personal/agency styles such as `snizco-agency`
- project registry: client-specific templates stored with a project

The plan for "Snizco Agency style" is:

1. Register the Snizco Agency `.pptx` once.
2. Extract and validate its template profile once.
3. Save a style pack that maps semantic deck needs to Snizco layouts.
4. Register any reusable slide library that belongs to the style.
5. Let Jay and other skills reference the style by name.
6. Reuse the cached profile and slide library until the source files or extraction code change.

### Slide Libraries

Each style can have a slide library.

A slide library is a curated set of reusable slides and slide patterns that can be inserted into generated decks alongside newly generated slides. This is required for agency and enterprise styles where some slides are standardized, such as "About Us", credentials, methodology, process, team, case study, legal disclaimer, or standard service offering slides.

Example:

```text
Burson style
  -> Burson template profile
  -> Burson style pack
  -> Burson slide library
       - about-us
       - methodology
       - global-network
       - sector-expertise
       - credentials
       - case-study
       - legal-disclaimer
```

Slide library entries can be:

- **Full-built slides:** complete slides that are inserted mostly unchanged, such as `about-us` or `legal-disclaimer`.
- **Parameterized library slides:** reusable slides with named editable fields, such as a case-study slide with `{{client}}`, `{{challenge}}`, `{{solution}}`, and `{{result}}`.
- **Pattern slides:** partially built slide structures that should be populated by Deck Factory, such as a three-column framework, quote page, timeline, or market-map slide.
- **Appendix slides:** reusable source, methodology, glossary, or notes slides.

The planner should decide for each output slide whether to:

- generate the slide from the deck spec using the style/template
- select a full-built library slide
- select and populate a parameterized library slide
- use a pattern slide as the base for generated content

The generated deck can therefore include both generated slides and selected library slides.

Slide library selection should be deterministic enough to audit but agentic enough to be useful:

- deterministic code indexes library metadata, fingerprints source slides, validates required fields, and inserts selected slides
- OpenClaw planner/reviewer decides which library slides are appropriate for the brief, report type, audience, and style

Deck Factory must not re-extract a slide library every run. Like template profiles, slide libraries should be registered, fingerprinted, cached, and refreshed only when source files or extractor versions change.

Library entries should support tags:

- style id
- slide id
- display name
- slide type
- audience
- report archetype
- insertion rules
- required fields
- optional fields
- source deck path
- source slide number or stable slide id
- fingerprint
- last extracted timestamp

If a requested or planner-selected library slide is missing, stale, unsupported, or missing required fields, Deck Factory should fail closed or ask for a substitute; it should not silently replace it with a generated approximation.

### Skill-To-Deck Composition

Deck Factory should be a deck renderer/orchestrator that can consume structured outputs from other OpenClaw skills.

The user flow should support:

```text
"Jay, do a 5C Research Report on Chick-fil-A in a deck in Snizco Agency style."
```

That means:

1. Jay identifies `5C Research Report` as the research/content skill.
2. Jay identifies `Snizco Agency style` as the registered Deck Factory style/template.
3. Jay runs the 5C research skill through OpenClaw.
4. The 5C skill returns a structured deck handoff, not just prose.
5. Deck Factory uses the cached Snizco Agency template profile and slide library.
6. Deck Factory plans which slides are generated and which are selected from the library.
7. Deck Factory renders the deck.
8. Deck Factory runs screenshot QA and repair.
9. Jay returns the final `deck.pptx`.

Other skills should not need to know how to write PowerPoint. They should output a deck-ready handoff contract that Deck Factory can consume.

The handoff contract should include:

- report type, such as `5c-research-report`
- subject, such as `Chick-fil-A`
- audience
- objective
- recommended deck length
- sections
- findings
- evidence/citations
- tables/charts requested
- asset references
- sensitivity/privacy flags
- preferred style id, such as `snizco-agency`
- requested library slides, such as `about-us` or `methodology`

Deck Factory then owns template selection, slide mapping, rendering, screenshot QA, and repair.

### Public OpenClaw User Flow

The public OpenClaw experience should be:

```text
clone repo
  -> install dependencies
  -> install or reference Deck Factory OpenClaw skill
  -> register a prepared `.pptx` template deck once
  -> optionally register a slide library once
  -> ask an OpenClaw agent for a deck in that style
  -> receive `<out>/deck.pptx`
```

The repo is not considered public-integration ready until a clean OpenClaw user can complete that flow without Brian-specific hostnames, paths, or agent ids.

For user-facing requests such as:

```text
"Do a 5C Research Report on Chick-fil-A in a deck in Snizco Agency style."
```

the OpenClaw skill should:

1. identify the upstream research skill and require a schema-valid `skill-deck-handoff.json`
2. resolve `Snizco Agency style` to a registered style id
3. reuse current cached template and slide-library profiles
4. stop and ask for template registration if the style is unknown
5. choose a deterministic output directory
6. call `deck-factory run --style <style-id> --handoff <handoff-path> --out <run-dir>`
7. return the final `deck.pptx`

Agent-initiated output directories should default to:

```text
artifacts/<subject-slug>-<report-type-slug>-<style-id>/
```

For example:

```text
artifacts/chick-fil-a-5c-research-report-snizco-agency/deck.pptx
```

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
    registry/
      template-registry.ts
      style-pack.ts
      slide-library.ts
      fingerprint.ts
    qa/
      rasterize.ts
      deterministic-checks.ts
      screenshot-evaluator.ts
      repair-plan.ts
    workflow/
      build-deck.ts
      compose-from-skill.ts
      repair-loop.ts
      handoff.ts
  registry/
    templates.json
    styles/
      snizco-agency.json
    slide-libraries/
      burson.json
      snizco-agency.json
    source-slides/
      burson-library.pptx
      snizco-agency-library.pptx
  openclaw/
    agents/
      deck-factory-planner.json
      deck-factory-reviewer.json
    skills/
      deck-factory/
        SKILL.md
        examples/
          chick-fil-a-5c-request.md
          template-registration.md
        tests/
          static-skill-check.mjs
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
deck-factory templates register --id snizco-agency --name "Snizco Agency" --template-deck templates/snizco-agency.pptx
deck-factory libraries register --style snizco-agency --library-deck libraries/snizco-agency-library.pptx
deck-factory templates list
deck-factory templates inspect snizco-agency
deck-factory templates refresh snizco-agency
deck-factory libraries list --style snizco-agency
deck-factory libraries inspect --style snizco-agency about-us
deck-factory extract --template-deck samples/business-review/template.pptx --out artifacts/business-review/profile
deck-factory build --spec samples/business-review/deck-spec.json --out artifacts/business-review/run
deck-factory qa --deck artifacts/business-review/run/deck.pptx --out artifacts/business-review/run/qa
deck-factory repair --run artifacts/business-review/run --out artifacts/business-review/repaired
```

The first end-to-end command can wrap those stages:

```bash
deck-factory run --template-deck template.pptx --brief brief.md --out artifacts/client-deck
```

The normal reusable-style path should avoid re-extraction:

```bash
deck-factory run --style snizco-agency --brief brief.md --out artifacts/chick-fil-a-5c
```

And the cross-skill path should accept a structured handoff:

```bash
deck-factory run --style snizco-agency --handoff artifacts/5c/chick-fil-a/deck-handoff.json --out artifacts/chick-fil-a-5c
```

Library slides can be requested explicitly:

```bash
deck-factory run --style burson --brief brief.md --include-library-slide about-us --include-library-slide methodology --out artifacts/burson-report
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

The repo ships an OpenClaw skill at `openclaw/skills/deck-factory/SKILL.md` that tells agents how to use Deck Factory.

The skill:

- require a prepared `.pptx` template deck or stop with a preparation request
- resolve natural style names through the Deck Factory registry
- reuse cached template profiles and slide-library indexes instead of re-extracting on every run
- register templates and slide libraries only when the user supplies new source files or asks for refresh
- call the local CLI instead of hand-editing PowerPoint files
- keep AI judgment behind the configured OpenClaw worker lanes
- require screenshot QA before calling a deck final
- require PowerPoint package-integrity QA before calling a deck final
- choose deterministic output directories for agent-initiated runs
- return `deck.pptx` as the primary artifact
- expose internal screenshots and QA evidence only when asked or when explaining failure
- fail closed when OpenClaw, model credentials, rasterizer tools, templates, slide libraries, assets, or QA evidence are missing

The public skill must not assume Brian-specific infrastructure. `ssh snizserver openclaw` and agent `jay` are local deployment overrides, not public defaults.

The repo includes `npm run check:skill`, a static skill check that verifies:

- the skill file exists
- required sections are present
- no Brian-specific hostname is required by default
- examples use portable paths or clearly marked local overrides
- documented commands match the CLI surface

### OpenClaw Configuration Expectations

Deck Factory should not assume model credentials exist.

Before any AI step, it should verify:

- `openclaw` is installed and executable.
- the configured Deck Factory worker agent exists.
- the worker agent has a usable model/auth profile.
- `openclaw agent --json` returns a parseable envelope on a smoke prompt.
- required local tools for rendering/rasterization are installed.

Public default resolution order:

1. CLI flags such as `--openclaw-command`, `--planner-agent`, and `--out`
2. environment variables such as `DECK_FACTORY_OPENCLAW_COMMAND` and `DECK_FACTORY_OPENCLAW_AGENT`
3. local `openclaw` on `PATH`
4. fail with setup instructions

Brian-specific remote execution can be documented separately as an operator override.

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

### Cross-Skill Orchestration In Jay

Jay should be able to compose multiple skills without the user manually running each stage.

For:

```text
"Jay, do a 5C Research Report on Chick-fil-A in a deck in Snizco Agency style."
```

Jay should plan:

1. Use the 5C research skill to produce structured research.
2. Require that skill to emit a `skill-deck-handoff.json`.
3. Resolve `Snizco Agency style` through the Deck Factory template registry.
4. Confirm the registered template profile and slide library are current by checking cached fingerprints.
5. Decide whether the report needs standard reusable slides, such as methodology, credentials, or about-us.
6. Run Deck Factory from the handoff and cached style/library.
7. Run screenshot QA and repair.
8. Return only the final `deck.pptx` unless the user asks for evidence.

Jay should not ask the user to re-upload or re-extract the Snizco Agency template or slide library if they are already registered and current.

If the style name is unknown, Jay should say exactly that:

```text
I do not have a registered Deck Factory style named "Snizco Agency" yet. Send me the Snizco Agency template deck once and I will register it for reuse.
```

If the cached template fingerprint is stale, Jay should refresh the profile automatically if the source file is available. If the source file is missing, Jay should stop and ask for the current template deck.

If a style has a slide library, Jay should use it when the deck type naturally calls for standard slides. For example, a Burson-style deck can include a reusable `about-us` slide and still include newly generated 5C analysis slides. Jay should mention this briefly when useful:

```text
I found the Burson slide library and will include the standard About Us and Methodology slides, then generate the market/customer/competitor analysis slides from the 5C research.
```

## Data Contracts

### Template Registry

`templates.json` should include:

- `version`
- `templates`
- template id
- display name
- source template deck path
- source content hash
- extractor version
- profile schema version
- cached profile path
- preparation status
- supported report/deck types
- created/updated timestamps

### Style Pack

Each style pack should include:

- `styleId`
- `displayName`
- `templateId`
- `brandVoice`
- `defaultAudience`
- `supportedArchetypes`
- `slideLibraries`
- `layoutMap`
- `colorUsageNotes`
- `typographyNotes`
- `chartStyleNotes`
- `imageStyleNotes`
- `qaStrictness`
- `fallbackPolicy`

The style pack is where `Snizco Agency style` becomes a concrete rendering contract.

### Slide Library

Each style can have one or more slide libraries. `slide-library.json` should include:

- `version`
- `styleId`
- `libraryId`
- `displayName`
- `sourceLibraryDeckPath`
- `sourceContentHash`
- `extractorVersion`
- `slides`
- `createdAt`
- `updatedAt`

Each slide library entry should include:

- `slideId`
- `displayName`
- `kind`: `full-built`, `parameterized`, `pattern`, or `appendix`
- `sourceSlideNumber`
- `sourceStableSlideId`
- `tags`
- `supportedArchetypes`
- `insertionRules`
- `requiredFields`
- `optionalFields`
- `lockedElements`
- `editableElements`
- `thumbnailPath`
- `fingerprint`
- `usageNotes`

The slide library is where reusable style-specific slides such as `about-us`, `methodology`, `credentials`, and `legal-disclaimer` become addressable deck-building blocks.

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
- `style`
- `librarySlides`
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
- `source`: `generated`, `library`, or `library-pattern`
- `layout`
- `librarySlideId` when source is `library` or `library-pattern`
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

### Skill Deck Handoff

`skill-deck-handoff.json` should include:

- `version`
- `sourceSkill`
- `sourceRunId`
- `reportType`
- `subject`
- `audience`
- `objective`
- `preferredStyleId`
- `sections`
- `findings`
- `evidence`
- `citations`
- `requestedCharts`
- `requestedTables`
- `requestedLibrarySlides`
- `assetRefs`
- `sensitivity`
- `openQuestions`

This is the bridge between a research skill and Deck Factory. The handoff should be strict JSON, schema-validated, and treated as untrusted input until validated.

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
- Registry storage conventions for global and project-local templates.

Acceptance checks:

- `npm install` succeeds.
- `npm test` or equivalent smoke command succeeds.
- `deck-factory --help` prints available commands.
- `deck-factory doctor` reports OpenClaw, renderer, rasterizer, and model-worker readiness without mutating state.

### Phase 1: Registry, Schema, And Fixtures

Deliverables:

- `deck-spec.schema.json`.
- `template-profile.schema.json`.
- `qa-report.schema.json`.
- `template-registry.schema.json`.
- `style-pack.schema.json`.
- `slide-library.schema.json`.
- `skill-deck-handoff.schema.json`.
- TypeScript types generated or maintained from schemas.
- One hand-authored sample `deck-spec.json`.
- One hand-authored sample `skill-deck-handoff.json`.
- Placeholder sample template directories.
- `deck-factory templates` command group.

Acceptance checks:

- Valid sample specs pass schema validation.
- Valid sample handoffs pass schema validation.
- Invalid sample specs fail with useful errors.
- Invalid style/template registry entries fail with useful errors.
- Invalid slide library entries fail with useful errors.
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
- `deck-factory templates register`.
- Template fingerprinting based on source `.pptx` content hash plus extractor/profile schema versions.
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
- Re-registering an unchanged template reuses the cached profile instead of extracting again.
- Changing the source `.pptx` hash invalidates the cached profile and refreshes extraction.

### Phase 3b: Style Pack And Template Cache

Deliverables:

- `deck-factory templates list`.
- `deck-factory templates inspect`.
- `deck-factory templates refresh`.
- Style pack resolution from natural/user-facing style names to template ids.
- Built-in or sample `snizco-agency` style pack placeholder.
- Slide library registration and cache metadata for each style.

Acceptance checks:

- `--style snizco-agency` resolves to the registered template profile.
- Unknown styles fail with a clear "style not registered" error.
- Cached template profiles are reused across multiple runs.
- Forced refresh re-extracts and updates the cached fingerprint.
- Registered slide libraries are reused across multiple runs.
- A stale slide library fingerprint triggers refresh or a fail-closed missing-source error.

### Phase 3c: Slide Library Indexing

Deliverables:

- `deck-factory libraries register`.
- `deck-factory libraries list`.
- `deck-factory libraries inspect`.
- Slide-level fingerprints and thumbnails for library entries.
- Metadata extraction for full-built, parameterized, pattern, and appendix slides.
- Library prep report for unsupported or ambiguous reusable slides.

Acceptance checks:

- A sample library deck registers under a style.
- `about-us` and `methodology` library slides can be addressed by id.
- Full-built slides can be inserted without regeneration.
- Parameterized slides fail closed when required fields are missing.
- Pattern slides can be used as a base for generated content.

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
- Prompt/schema for turning `skill-deck-handoff.json` into `deck-spec.json`.
- Prompt/schema for choosing generated slides versus library slides.
- Missing-input detection for assets, data, citations, or brand constraints.
- OpenClaw worker artifact capture.

Acceptance checks:

- Planner returns schema-valid `deck-spec.json`.
- Planner cannot write files directly; only the CLI writes validated outputs.
- Planner names assumptions and missing inputs.
- Planner output fails closed when it references unknown layouts or missing assets.
- Planner preserves citations and evidence from the source skill handoff.
- Planner can select library slides by id and explain why each library slide belongs.

### Phase 4c: Cross-Skill Deck Handoff

Deliverables:

- `compose-from-skill` workflow.
- `skill-deck-handoff.json` schema.
- Example handoff for `5c-research-report` on a sample company.
- Jay/OpenClaw orchestration instructions for running a research skill then Deck Factory.

Acceptance checks:

- A sample 5C handoff can produce a deck spec.
- A sample handoff can request or accept standard library slides.
- Handoff input is validated before planning.
- Missing citations, source skill output, or requested assets fail closed.
- Deck Factory never needs the upstream skill to know PowerPoint internals.

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
- `--style` support for registered styles.
- `--handoff` support for structured output from upstream skills.
- `--include-library-slide` support for explicit reusable slides.
- Final `deck.pptx` copied to the requested output location.
- Internal evidence retained in the run folder.

Acceptance checks:

- A sample run produces a final `deck.pptx`.
- A second run with the same registered style reuses the cached template profile.
- A sample 5C handoff renders with `--style snizco-agency`.
- A generated deck can mix generated slides and inserted library slides.
- Internal screenshots and QA artifacts exist.
- User-facing output is not cluttered unless optional evidence output is requested.
- The command fails closed on missing template, invalid spec, missing assets, rasterization failure, missing OpenClaw worker config, or missing model credentials.

### Phase 9: Agent Skill Contract

Deliverables:

- `openclaw/skills/deck-factory/SKILL.md`.
- Input/output contract for Codex, OpenClaw, Claude, Cursor, Gemini, and similar agent runners.
- Examples for using Deck Factory from an agent workflow.
- Guidance on when to ask for missing templates, assets, facts, or review approval.
- OpenClaw-native worker/skill installation notes.
- Style-name resolution rules.
- Template and slide-library registration workflow.
- Deterministic output-path convention.
- Static skill/package check.

Acceptance checks:

- Skill can invoke the local CLI.
- Skill uses the screenshot and QA loop before calling a deck final.
- Skill returns `deck.pptx` as the primary artifact.
- Skill does not hide failures behind dummy data or placeholder outputs.
- Skill routes AI judgment through OpenClaw worker lanes rather than direct provider calls.
- Skill does not assume Brian-specific hostnames, paths, or agent ids.
- Unknown style names produce an explicit template-registration request.
- Registered styles are reused without re-extraction when fingerprints are current.
- A clean clone can follow the skill docs from sample handoff to `deck.pptx`.

### Phase 10: Public OpenClaw Integration Hardening

Deliverables:

- `docs/openclaw-integration.md`.
- README public setup section.
- Portable OpenClaw defaults.
- Clean-clone smoke script or documented command bundle.
- Sample run showing template registration, slide-library registration, handoff planning, render, QA, repair, and final deck.

Acceptance checks:

- `npm install`, `npm run build`, `npm test`, and `npm run cli -- doctor --json` work from a clean clone.
- The OpenClaw skill can be installed or referenced by a user without editing repo source.
- The public docs default to local `openclaw` and clearly show how to override the command.
- A user can register their own `.pptx` template deck and optional slide library.
- A second run with the same style reuses cached template and library profiles.
- The final output path is predictable and documented.
- Failure states produce concrete missing-prerequisite messages.

## V0 Definition Of Done

V0 is complete when Deck Factory can:

1. Accept a user-supplied `.pptx` template with representative dummy slides.
2. Distinguish template decks, reference decks, `.potx` templates, and generated output decks.
3. Register a template under a reusable style id.
4. Register a slide library under a reusable style id.
5. Reuse cached template profiles and slide libraries instead of re-extracting unchanged sources.
6. Produce a preparation report for templates or slide libraries that are not ready.
7. Extract a minimal but useful template profile.
8. Accept a structured handoff from another skill, such as a 5C research skill.
9. Use OpenClaw worker lanes to plan or revise a semantic deck spec.
10. Validate a semantic deck spec.
11. Render a 3 to 5 slide editable deck.
12. Mix generated slides and selected library slides in the same deck.
13. Rasterize every output slide.
14. Run deterministic QA.
15. Run OpenClaw-backed screenshot evaluator review.
16. Repair at least one common failure by changing the deck spec and rerendering.
17. Deliver `deck.pptx` as the primary user artifact.
18. Preserve internal evidence for debugging and reproducibility.
19. Ship a repo-local OpenClaw skill that can call the workflow.
20. Provide portable setup docs for non-Brian OpenClaw users.
21. Prove a clean clone can run from sample handoff to `deck.pptx`.
22. Avoid Brian-specific hostnames, paths, and agent ids in public defaults.

## Fail-Closed Rules

Deck Factory must stop with a concrete error when:

- the template is missing, unreadable, or not a supported `.pptx`
- a `.potx` is supplied before `.potx` normalization is implemented
- a `.pptx` is supplied without a declared file role
- a requested style is not registered
- a registered style points to a missing source template and no cached ready profile exists
- a cached profile is stale and cannot be refreshed
- a requested library slide is not registered
- a selected library slide is unsupported, stale, or missing required parameter fields
- the template deck is valid PowerPoint but not prepared enough for safe ingestion
- a skill deck handoff fails schema validation
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
3. Add registry/style/handoff schemas.
4. Add `deck-factory doctor` with OpenClaw readiness checks.
5. Define PowerPoint file roles and CLI flags.
6. Implement `deck-factory templates register/list/inspect/refresh`.
7. Implement `deck-factory libraries register/list/inspect`.
8. Write the template and slide-library preparation guides.
9. Create sample folder structure and initial sample specs.
10. Build the simplest Deck Factory-ready `.pptx` sample template.
11. Build a small sample slide library with `about-us` and `methodology` slides.
12. Register a placeholder `snizco-agency` style.
13. Implement template extraction, fingerprinting, cache reuse, and `template-prep-report.md`.
14. Implement slide library indexing, fingerprinting, cache reuse, and library prep reports.
15. Implement OpenClaw JSON-worker wrapper.
16. Implement OpenClaw planner worker for `deck-spec.json`.
17. Implement the skill handoff contract with a sample 5C handoff.
18. Implement the `pptx-automizer` adapter.
19. Render the first sample `deck.pptx` with both generated and library slides.
20. Add rasterization and deterministic QA.
21. Add OpenClaw screenshot evaluator review.
22. Add OpenClaw-backed spec-first repair loop.
23. Wrap the whole path in `deck-factory run --style ... --handoff ...`.
24. Add `openclaw/skills/deck-factory/SKILL.md`.
25. Add portable OpenClaw setup docs and examples.
26. Add a static skill/package check.
27. Add a clean-clone public integration smoke path.
