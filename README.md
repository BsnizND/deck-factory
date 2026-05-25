# Deck Factory

Deck Factory is an agentic workflow for producing client-ready presentation decks from real brand templates, structured intent, deterministic slide operations, and visual QA.

The core bet is simple: great decks should not be generated as disposable images or loose text blobs. They should be built from the same materials a human presentation team uses: a `.pptx` template, layout rules, typography, color systems, reusable slide patterns, revision notes, and a review loop that can catch visual failures before the client sees them.

## Status

Deck Factory now has a working v0 implementation path: schema validation, sample `.pptx` fixtures, cache-aware template/style/slide-library registration, explicit PowerPoint file roles, editable PPTX rendering, screenshot rasterization, OpenClaw-backed screenshot review, spec-first repair, PowerPoint package integrity checks, and a repo-shipped OpenClaw skill package.

It is still intentionally conservative. Screenshot QA requires LibreOffice (`soffice` or `libreoffice`), ImageMagick (`magick`), and Ghostscript (`gs`) on `PATH`; OpenClaw model judgment defaults to the configured OpenClaw command and worker agent. Public defaults prefer local `openclaw`; remote commands and personal worker agents are deployment overrides.

## The Pipeline

```text
template.pptx
  -> extracted template profile
  -> structured deck spec
  -> deterministic slide operations
  -> PPTX render
  -> slide screenshots
  -> overflow, bounds, contrast, and layout QA
  -> repair loop
  -> approval-ready artifact
```

## Why This Exists

AI slide tools are improving quickly, but most still optimize for fast first drafts. Agency and client work needs something stricter:

- decks that respect a real brand template
- editable PowerPoint output, not flat screenshots
- repeatable rendering from structured specs
- validation for bounds, overlaps, typography, contrast, and missing assets
- a repair loop that can inspect the rendered result and revise the deck
- human approval checkpoints before anything is called final

Deck Factory is meant to become the reliable production layer around that process.

## Inspiration And Prior Art

This category is already emerging. Deck Factory should learn from the best available pieces instead of pretending the space is empty:

- [agent-slides](https://github.com/mpuig/agent-slides): template extraction, schema-validated slide operations, and agent-friendly slide workflows.
- [Presenton](https://github.com/presenton/presenton): open-source AI presentation generation, self-hosting, templates, and export workflows.
- [pptx-automizer](https://github.com/singerla/pptx-automizer): a strong PowerPoint template editing and composition layer.
- [pptx.dev / OpenPresentation](https://www.pptx.dev/): structured presentation specs designed for AI pipelines.
- [AI Indigo Slides skill](https://aiindigo.com/skills/slides): PptxGenJS-oriented deck generation with rasterized visual validation.

The goal is not to clone any single project. The goal is to define a dependable deck-production contract and wrap the best renderer, validation, and agent orchestration pieces behind it.

## Product Shape

Deck Factory should become both:

- a local CLI/workflow for building and validating decks
- an agent skill contract that tools like Codex, OpenClaw, Claude, Cursor, Gemini, or custom agency agents can use safely

The workflow should support:

- template profiling from `.pptx`
- structured deck briefs and slide specs
- schema validation before render
- deterministic operations for title, body, charts, tables, images, footers, and notes
- visual QA from rendered screenshots
- model-assisted repair when QA fails
- approval bundles containing the `.pptx`, screenshots, QA report, and revision notes

## Design Principles

- **Template first.** Brand, layout, typography, and color rules come from the supplied deck, not from generic defaults.
- **Editable output.** The final artifact must remain useful in PowerPoint.
- **Fail closed.** Missing templates, assets, fonts, credentials, renderers, or validation evidence should stop the run.
- **Agentic where it matters.** Let models reason about ambiguous briefs, slide sequencing, critique, and repair. Use deterministic code for schemas, rendering, filesystem boundaries, and QA checks.
- **Visible evidence.** A deck is not ready until screenshots and validation artifacts prove what was rendered.

## Repo Map

- [plan.md](plan.md): the end-to-end implementation plan.
- [docs/idea.md](docs/idea.md): the fuller product concept.
- [docs/architecture.md](docs/architecture.md): proposed system shape and module boundaries.
- [docs/decisions.md](docs/decisions.md): v0 architecture decisions.
- [docs/execution-plan.md](docs/execution-plan.md): ordered remaining work to finish the project.
- [docs/openclaw-integration.md](docs/openclaw-integration.md): the plan for making Deck Factory portable for OpenClaw users.
- [docs/roadmap.md](docs/roadmap.md): staged build plan.
- [docs/template-library-onboarding.md](docs/template-library-onboarding.md): how to prepare and register templates and slide libraries.

## Current CLI

```bash
npm install
npm run generate:samples
npm run cli -- doctor
npm run cli -- templates register --id snizco-agency --name "Snizco Agency" --template-deck samples/snizco-agency/template.pptx
npm run cli -- libraries register --style snizco-agency --library-deck samples/snizco-agency/library.pptx
npm run cli -- build --spec samples/snizco-agency/deck-spec.json --out artifacts/sample-build
npm run cli -- qa --deck artifacts/sample-build/deck.pptx --spec samples/snizco-agency/deck-spec.json --out artifacts/sample-build
npm run cli -- run --style snizco-agency --spec samples/snizco-agency/overcrowded-deck-spec.json --out artifacts/overcrowded-repair --max-repair-attempts 1
npm run check:skill
npm run smoke:public
```

The end-to-end entrypoint is:

```bash
npm run cli -- run --style snizco-agency --handoff samples/5c-research/chick-fil-a-handoff.json --out artifacts/chick-fil-a-5c
```

`run --handoff` uses the OpenClaw JSON worker path to produce `deck-spec.json` before rendering. The public default OpenClaw command is local `openclaw`, and the public default planner agent is `deck-factory-planner`. Override with `DECK_FACTORY_OPENCLAW_COMMAND`, `DECK_FACTORY_OPENCLAW_AGENT`, `--openclaw-command`, or `--planner-agent` for local deployments. `run --spec` skips planning only when an approved deck spec already exists, then still renders and QA checks the deck.

If `--out` is omitted for a handoff run, Deck Factory writes to:

```text
artifacts/<subject-slug>-<report-type-slug>-<style-id>/deck.pptx
```

## OpenClaw Skill

The repo ships an OpenClaw skill at:

```text
openclaw/skills/deck-factory/SKILL.md
```

Install or reference it from OpenClaw with the local skill directory:

```bash
openclaw skills install ./openclaw/skills/deck-factory --as deck-factory
openclaw skills check --json
```

For an agent-specific install:

```bash
openclaw skills install ./openclaw/skills/deck-factory --as deck-factory --agent <agent-id>
openclaw skills check --agent <agent-id> --json
```

Run a full smoke with OpenClaw when a worker agent is configured:

```bash
DECK_FACTORY_OPENCLAW_AGENT=deck-factory-planner npm run smoke:public -- --with-openclaw
```

For deployments where OpenClaw is reached through a remote command, set `DECK_FACTORY_OPENCLAW_COMMAND` explicitly. The public docs and skill do not require a private host or personal agent id.

## License

MIT
