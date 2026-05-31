# Deck Factory

Deck Factory is an agentic workflow for producing client-ready presentation decks from real brand templates, structured intent, deterministic slide operations, and visual QA.

The core bet is simple: great decks should not be generated as disposable images or loose text blobs. They should be built from the same materials a human presentation team uses: a `.pptx` template, layout rules, typography, color systems, reusable slide patterns, revision notes, and a review loop that can catch visual failures before the client sees them.

## Status

Deck Factory now has a working v0 implementation path: schema validation, sample `.pptx` fixtures, cache-aware template/style/slide-library registration, explicit PowerPoint file roles, editable PPTX rendering, screenshot rasterization, OpenClaw-backed screenshot review, spec-first repair, PowerPoint package integrity checks, a repo-shipped OpenClaw skill package, and an explicit Computer Use mode switch.

It is still intentionally conservative. Screenshot QA requires LibreOffice (`soffice` or `libreoffice`), ImageMagick (`magick`), and Ghostscript (`gs`) on `PATH`; OpenClaw model judgment defaults to the configured OpenClaw command and execution lane. Public defaults prefer local `openclaw`; remote commands and personal agent ids are deployment overrides.

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
- [checklist.md](checklist.md): consolidated production-hardening implementation checklist.
- [docs/idea.md](docs/idea.md): the fuller product concept.
- [docs/architecture.md](docs/architecture.md): proposed system shape and module boundaries.
- [docs/decisions.md](docs/decisions.md): v0 architecture decisions.
- [docs/execution-plan.md](docs/execution-plan.md): ordered remaining work to finish the project.
- [docs/openclaw-integration.md](docs/openclaw-integration.md): the plan for making Deck Factory portable for OpenClaw users.
- [docs/roadmap.md](docs/roadmap.md): staged build plan.
- [docs/slide-template-instructions.md](docs/slide-template-instructions.md): feature proposal for layout guidance and placeholder writing contracts.
- [docs/template-library-onboarding.md](docs/template-library-onboarding.md): how to prepare and register templates and slide libraries.

## Current CLI

```bash
npm install
npm run generate:samples
npm run cli -- doctor
npm run cli -- templates register --id snizco-agency --name "Snizco Agency" --template-deck samples/snizco-agency/template.pptx
npm run cli -- templates instructions init snizco-agency
npm run cli -- templates instructions validate snizco-agency
npm run cli -- libraries register --style snizco-agency --library-deck samples/snizco-agency/library.pptx
npm run cli -- build --spec samples/snizco-agency/deck-spec.json --out artifacts/sample-build
npm run cli -- qa --deck artifacts/sample-build/deck.pptx --spec samples/snizco-agency/deck-spec.json --out artifacts/sample-build
npm run cli -- run --style snizco-agency --spec samples/snizco-agency/overcrowded-deck-spec.json --out artifacts/overcrowded-repair --max-repair-attempts 1
npm run check:skill
npm run smoke:public
npm run test:gauntlet
```

The end-to-end entrypoint is:

```bash
npm run cli -- run --style snizco-agency --handoff samples/5c-research/chick-fil-a-handoff.json --out artifacts/chick-fil-a-5c --computer-use off
```

`run --handoff` uses the OpenClaw JSON worker path to produce `deck-spec.json` before rendering. The public default OpenClaw command is local `openclaw`, and the CLI default planner identifier is `deck-factory-planner` for standalone setups. Production deployments should override with `DECK_FACTORY_OPENCLAW_COMMAND`, `DECK_FACTORY_OPENCLAW_AGENT`, `--openclaw-command`, or `--planner-agent` to use an approved existing execution lane. Set `DECK_FACTORY_OPENCLAW_MODEL=<provider/model>` when the deployment should use OpenClaw's tool-free `infer model run` path for schema-only JSON planning and screenshot review. Do not create a new OpenClaw worker agent just to run Deck Factory. `run --spec` skips planning only when an approved deck spec already exists, then still renders and QA checks the deck.

Computer Use is intentionally separate from the core deck pipeline. Set `DECK_FACTORY_COMPUTER_USE=off` or pass `--computer-use off` when the runtime should not rely on desktop UI control. Use `optional` only when an orchestrating agent may run a separate post-build desktop check. Use `required` only when that external verification path is already proven; the Deck Factory CLI records the requirement but does not drive `@Computer` itself.

## Optional Artifact Publishing

Deck Factory can optionally publish the final deck through an external artifact publisher after render and QA pass. Publishing is disabled by default.

For tailnet-local downloads, install and run `artifact-gateway`, expose it with Tailscale Serve, set `TAG_BASE_URL`, then run:

```bash
npm run cli -- run \
  --style <style-id> \
  --handoff <handoff.json> \
  --computer-use off \
  --publish tailnet-gateway \
  --publish-ttl 24h
```

Deck Factory writes `<out>/publish-result.json` and includes the normalized publishing result in the CLI JSON. Use `--publish-required` only when the run should fail if post-QA publishing fails. The deck is preserved either way.

Equivalent environment variables are `DECK_FACTORY_PUBLISH`, `DECK_FACTORY_PUBLISH_REQUIRED`, `DECK_FACTORY_PUBLISH_TTL`, `DECK_FACTORY_PUBLISH_VISIBILITY`, and `DECK_FACTORY_ARTIFACT_GATEWAY_COMMAND`.

`DECK_FACTORY_ARTIFACT_GATEWAY_COMMAND` may be either a single executable such as `artifact-gateway` or a command prefix such as `npm --prefix /path/to/tailnet-artifact-gateway run cli --`. This keeps deployment-specific routes, hosts, and data directories in configuration instead of Deck Factory code. If the command runs on a remote host over `ssh`, run Deck Factory where the final `deck.pptx` path is readable by that remote command, or use a deployment wrapper that copies the file before publishing.

If `--out` is omitted for a handoff run, Deck Factory writes to:

```text
artifacts/<subject-slug>-<report-type-slug>-<style-id>/deck.pptx
```

Each run also writes internal evidence artifacts in the run directory:

- `run-summary.json`: canonical pass/fail state, gates, blocker findings, repair attempts, and artifact paths
- `template-compliance-report.json`: layout, placeholder, citation, and asset compliance against registered template instructions when present
- `template-security-report.json`: conservative scan of the selected template deck for external links, embedded objects/media, notes/comments, metadata, and macro indicators
- `runtime-provenance.json`: OS, Node, Deck Factory version, renderer adapter, rasterizer tool versions, and template font context
- `source-map.json`: slide-to-source map for layout choice, citations, assets, library slide ids, and selection reasons
- `capabilities.json`: whether Computer Use was disabled, optional, or externally required for that run
- `product-quality-report.json`: product acceptance findings for source depth, fixture caveats, citations, speaker notes, and client-delivery polish
- `qa-report.json`: severity-coded QA findings plus compatibility fields

Severity is shared across reports: `BLOCKER` fails the run, `MAJOR` is production-relevant, `MINOR` is a warning, and `INFO` is provenance/evidence.

Product-quality review defaults to warning mode. Use `--product-quality strict`
or `DECK_FACTORY_PRODUCT_QUALITY=strict` for production/client delivery so a
technically renderable but shallow deck fails before final handoff or publishing.

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

Run a full smoke with OpenClaw when an approved existing execution lane is configured:

```bash
DECK_FACTORY_OPENCLAW_AGENT=<existing-agent-id> \
DECK_FACTORY_OPENCLAW_MODEL=<provider/model> \
npm run smoke:public -- --with-openclaw
```

For deployments where OpenClaw is reached through a remote command, set `DECK_FACTORY_OPENCLAW_COMMAND` explicitly. The public docs and skill do not require a private host or personal agent id.

## License

MIT
