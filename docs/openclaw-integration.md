# OpenClaw Integration Plan

This document defines how Deck Factory integrates with OpenClaw for public, portable use.

## Current State

Deck Factory is a working local CLI and OpenClaw-backed workflow from source:

- templates can be registered once and reused through cached profiles
- slide libraries can be registered once and reused through cached indexes
- `run --handoff` can call OpenClaw JSON workers to draft a `deck-spec.json`
- the renderer produces editable `deck.pptx`
- QA rasterizes slides, validates package integrity, and can ask OpenClaw for screenshot review and repair
- Computer Use is configurable and is off by default for deck generation
- successful runs write `package-manifest.json` to separate the default client deck from internal evidence and delivery-control metadata

The repo now ships the agent-facing package under `openclaw/skills/deck-factory/`. The skill tells an OpenClaw agent how to discover styles, register templates, consume upstream skill handoffs, choose output paths, run QA, and return the final deck.

## Public Integration Goal

An OpenClaw user should be able to clone the repo, install dependencies, install the Deck Factory skill, register a prepared PowerPoint template deck once, and then ask an OpenClaw agent:

```text
Do a 5C research report on Chick-fil-A in a deck in Snizco Agency style.
```

The agent should:

1. run or request the upstream research skill
2. require a schema-valid `skill-deck-handoff.json`
3. resolve `Snizco Agency style` to a registered style id
4. reuse cached template and slide-library profiles when fingerprints are current
5. run Deck Factory with a deterministic output directory
6. perform render, screenshot QA, package-integrity QA, and repair without requiring desktop Computer Use
7. return the final `deck.pptx`

The agent must not re-extract a current registered template or slide library on every run.

## Repo-Shipped Skill

Included:

```text
openclaw/
  skills/
    deck-factory/
      SKILL.md
      examples/
        chick-fil-a-5c-request.md
        template-registration.md
      tests/
        static-skill-check.mjs
```

The skill defines:

- when to use Deck Factory
- non-goals, including not hand-editing OOXML or bypassing the CLI
- required prerequisites
- style/template resolution rules
- template deck preparation requirements
- slide-library registration and reuse rules
- cross-skill handoff requirements
- output-path convention
- QA and repair gates
- final response contract
- fail-closed blockers

Run its static check:

```bash
npm run check:skill
```

## Portable Defaults

The public path should not assume `ssh snizserver openclaw` or agent `jay`.

Use this resolution order:

1. CLI flags, such as `--openclaw-command` and `--planner-agent`
2. environment variables, such as `DECK_FACTORY_OPENCLAW_COMMAND` and `DECK_FACTORY_OPENCLAW_AGENT`
3. local `openclaw` on `PATH`
4. fail with a setup message if OpenClaw or an approved existing agent is unavailable

Deck Factory does not invent a planner-agent id. Brian-specific defaults can remain documented as local deployment notes, not as the public default; for Brian's current OpenClaw deployment, use `DECK_FACTORY_OPENCLAW_AGENT=jay-worker`.

## Computer Use Mode

Deck Factory must work with Computer Use disabled. The core run path is:

```bash
DECK_FACTORY_COMPUTER_USE=off
deck-factory run --style <style-id> --handoff <handoff.json> --computer-use off
```

Supported modes:

- `off`: default. Do not call or require `@Computer`, PowerPoint UI automation, Telegram UI inspection, or macOS desktop control.
- `optional`: deck generation and QA still succeed or fail without desktop control; an orchestrating OpenClaw agent may run a separate post-build Computer Use check only if that path is proven ready.
- `required`: caller requires an external Computer Use verification gate after the deck is built. The Deck Factory CLI records the requirement in `capabilities.json` but does not perform desktop UI control itself.

The skill should pass `--computer-use off` unless the user explicitly asks for desktop inspection or the local deployment has a proven Computer Use verification path. If Computer Use is off, `@Computer` failure must not block deck creation.

Install the skill from a clean clone:

```bash
openclaw skills install ./openclaw/skills/deck-factory --as deck-factory
openclaw skills check --json
```

Or install it for a specific agent:

```bash
openclaw skills install ./openclaw/skills/deck-factory --as deck-factory --agent <agent-id>
openclaw skills check --agent <agent-id> --json
```

## Template And Library Onboarding

A user-supplied style should be created with two explicit steps.

Register the prepared template deck:

```bash
deck-factory templates register \
  --id snizco-agency \
  --name "Snizco Agency" \
  --template-deck path/to/snizco-template.pptx
```

Register the slide library when available:

```bash
deck-factory libraries register \
  --style snizco-agency \
  --library-deck path/to/snizco-library.pptx
```

The template deck should be a normal `.pptx` with representative dummy slides, not a blank `.potx`. It should include `DF_LAYOUT` markers and stable Selection Pane names such as `df_title`, `df_body`, `df_subtitle`, and `df_footer`.

The slide library should be a normal `.pptx` with reusable slides marked by `DF_LIBRARY: <slide-id>`. Parameterized slides should use `{{field}}` tokens and must fail closed when required fields are missing.

## Style Resolution

The skill should resolve style names through the local registry:

- exact style id match, such as `snizco-agency`
- display-name match, such as `Snizco Agency`
- normalized display-name match, such as `snizco agency`

If no style is registered, the skill should say:

```text
I do not have a registered Deck Factory style named "Snizco Agency" yet. Send me the prepared `.pptx` template deck once and I will register it for reuse.
```

If a registered style points to a missing source deck but has a current cached ready profile, the skill may continue only if Deck Factory can render safely from the available registered paths. If the source is needed for refresh and missing, the skill must stop and ask for the current template deck.

## Output Path Convention

For agent-initiated runs, the default output directory should be deterministic and safe:

```text
artifacts/<subject-slug>-<report-type-slug>-<style-id>/
```

For example:

```text
artifacts/chick-fil-a-5c-research-report-snizco-agency/deck.pptx
```

The final user-facing artifact is always:

```text
<out>/deck.pptx
```

Internal evidence remains in the same run directory:

- `deck-spec.json`
- `capabilities.json`
- `package-manifest.json`
- `powerpoint-files.json`
- `operations.jsonl`
- `qa-report.json`
- `product-quality-report.json`
- `screenshots/`
- `openclaw-*/*`

The skill should return evidence only when the user asks or when the run fails.

## Cross-Skill Contract

Upstream skills do not need to know PowerPoint. They must produce a schema-valid `skill-deck-handoff.json` with:

- source skill and run id
- report type
- subject
- audience and objective
- preferred style id
- sections and findings
- evidence and citations
- requested charts, tables, and library slides
- asset references
- sensitivity and open questions

Deck Factory owns template selection, slide selection, rendering, QA, and repair after that handoff.

## Acceptance Criteria

The public OpenClaw integration is complete when:

1. a clean clone can run `npm install`, `npm run build`, `npm test`, and `npm run cli -- doctor --json`, with `doctor` reporting exact setup blockers when no approved OpenClaw lane is configured
2. the repo contains `openclaw/skills/deck-factory/SKILL.md`
3. the skill passes a static package check
4. the README explains how to install or reference the skill from OpenClaw
5. a user can register a new `.pptx` template deck and optional slide library
6. a second run reuses cached template and library profiles without re-extraction
7. an unknown style fails with a clear template-registration request
8. a sample `skill-deck-handoff.json` produces a final `deck.pptx`
9. the output path is deterministic and documented
10. the public default does not assume Brian's `snizserver`, `jay`, or any fabricated Deck Factory agent id
11. the default run path works with `--computer-use off`
12. missing OpenClaw, model credentials, rasterizer tools, templates, assets, or QA evidence fail closed
13. final handoff returns `deck.pptx` as the primary artifact
14. successful runs validate `package-manifest.json` and use it as the retention boundary between client deliverables and internal evidence

## Smoke Tests

Run the deterministic public smoke:

```bash
npm run smoke:public
```

Run the full OpenClaw handoff smoke once an approved existing execution lane is configured:

```bash
DECK_FACTORY_OPENCLAW_AGENT=<existing-agent-id> \
DECK_FACTORY_OPENCLAW_MODEL=<provider/model> \
npm run smoke:public -- --with-openclaw
```

If the execution lane lives behind a custom command, provide:

```bash
DECK_FACTORY_OPENCLAW_COMMAND="<openclaw command>" \
DECK_FACTORY_OPENCLAW_AGENT="<agent-id>" \
npm run smoke:public -- --with-openclaw
```

Do not create a new OpenClaw worker agent just to run Deck Factory. Pick an existing lane that already has the filesystem, model, and tool permissions required by the deployment, then record that override outside the public defaults.

For Brian's current two-agent OpenClaw topology, use `jay-worker` as that existing lane.

For schema-only planning and screenshot-review calls, prefer `DECK_FACTORY_OPENCLAW_MODEL=<provider/model>` so Deck Factory uses OpenClaw's `infer model run` surface instead of asking a conversational agent lane to behave like a JSON function. The outer workflow can still be launched by an existing execution lane such as a Jay worker.

When publishing through Tailnet Artifact Gateway, keep the publisher as an explicit deployment override:

```bash
DECK_FACTORY_PUBLISH=tailnet-gateway \
DECK_FACTORY_PUBLISH_REQUIRED=true \
DECK_FACTORY_ARTIFACT_GATEWAY_COMMAND="npm --prefix /path/to/tailnet-artifact-gateway run cli --" \
npm run cli -- run --style <style-id> --handoff <handoff.json> --computer-use off
```

`DECK_FACTORY_ARTIFACT_GATEWAY_COMMAND` accepts either one executable or a command prefix. The command must be able to read the final `deck.pptx` path; remote `ssh` publishers should run Deck Factory on the same host or use a deployment wrapper that copies the file first. Generated artifacts must use the private tailnet gateway route, not the ClawTV Funnel exception.

Every successful run writes `<run-directory>/package-manifest.json`. The manifest records `deck.pptx` as the only default handoff artifact, classifies `publish-result.json` as delivery metadata when publishing is enabled, and keeps QA/provenance/source/log artifacts internal unless the user asks for an approval package. It records safe delivery visibility and expiry metadata, but does not duplicate the tokenized download URL from `publish-result.json`.

The full smoke produces:

```text
artifacts/chick-fil-a-5c-research-report-snizco-agency/deck.pptx
```
