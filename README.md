# Deck Factory

Deck Factory is an agentic workflow for producing client-ready presentation decks from real brand templates, structured intent, deterministic slide operations, and visual QA.

The core bet is simple: great decks should not be generated as disposable images or loose text blobs. They should be built from the same materials a human presentation team uses: a `.pptx` template, layout rules, typography, color systems, reusable slide patterns, revision notes, and a review loop that can catch visual failures before the client sees them.

## Status

Deck Factory is in early implementation. The repo currently has a TypeScript CLI scaffold, schema validation, sample `.pptx` fixtures, cache-aware template/style/slide-library registration, an editable PPTX build path, a fail-closed QA report, and a first `run` command for plan/render/QA orchestration.

It is not production-ready yet. Screenshot rasterization requires LibreOffice (`soffice` or `libreoffice`) on `PATH`, and OpenClaw screenshot reviewer/repair loops still need to be completed before generated decks should be treated as client-ready.

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
- [docs/roadmap.md](docs/roadmap.md): staged build plan.

## Current CLI

```bash
npm install
npm run generate:samples
npm run cli -- doctor
npm run cli -- templates register --id snizco-agency --name "Snizco Agency" --template-deck samples/snizco-agency/template.pptx
npm run cli -- libraries register --style snizco-agency --library-deck samples/snizco-agency/library.pptx
npm run cli -- build --spec samples/snizco-agency/deck-spec.json --out artifacts/sample-build
npm run cli -- qa --deck artifacts/sample-build/deck.pptx --spec samples/snizco-agency/deck-spec.json --out artifacts/sample-build
```

The end-to-end entrypoint is:

```bash
npm run cli -- run --style snizco-agency --handoff samples/5c-research/chick-fil-a-handoff.json --out artifacts/chick-fil-a-5c
```

`run --handoff` uses the OpenClaw JSON worker path to produce `deck-spec.json` before rendering. The default OpenClaw target is `ssh snizserver openclaw` and the default worker agent is `jay`; override with `DECK_FACTORY_OPENCLAW_COMMAND`, `--openclaw-command`, or `--planner-agent` only when deploying somewhere else. `run --spec` skips planning only when an approved deck spec already exists, then still renders and QA checks the deck.

## License

MIT
