---
name: deck-factory
description: Build editable PowerPoint decks from registered Deck Factory styles, slide libraries, structured handoffs, and screenshot QA.
---

# Deck Factory

Use this skill when a user asks an OpenClaw agent to create, render, QA, or repair a PowerPoint deck using Deck Factory.

## When To Use

Use Deck Factory when the user asks for:

- an editable `.pptx` deck
- a deck in a named registered style
- a deck from an upstream skill handoff, such as research, strategy, audit, or report output
- insertion of reusable style-specific slides, such as about-us, methodology, credentials, case study, or legal/disclaimer slides

## Non-Goals

Do not hand-edit PowerPoint XML, OOXML package parts, or slide screenshots directly. Do not create placeholder decks, fake QA reports, canned screenshots, or success-looking output after a failed run. Do not call model providers directly from Deck Factory code; model judgment must go through the configured OpenClaw execution lane. Do not create or require a new OpenClaw worker agent for Deck Factory; use an approved existing execution lane selected by the deployment.

## Required Inputs

One of these must exist:

- a schema-valid `skill-deck-handoff.json`
- a schema-valid `deck-spec.json`
- a prepared `.pptx` template deck supplied for first-time style registration

A prepared template deck is a normal `.pptx` with representative dummy slides. It should include `DF_LAYOUT: <layout-id>` markers and stable Selection Pane names such as `df_title`, `df_body`, `df_subtitle`, and `df_footer`.

A slide library is a normal `.pptx` with reusable slides marked by `DF_LIBRARY: <slide-id>`. Parameterized slides should include `{{field}}` tokens.

## Style Resolution

Resolve a requested style through the Deck Factory registry before running a deck:

1. exact style id, such as `snizco-agency`
2. exact display name, such as `Snizco Agency`
3. normalized display name, such as `snizco agency`

If the style is not registered, stop and ask for the prepared `.pptx` template deck. Use this response shape:

```text
I do not have a registered Deck Factory style named "<style name>" yet. Send me the prepared `.pptx` template deck once and I will register it for reuse.
```

Do not re-extract a registered current template or slide library on every run. Reuse cached profiles unless the source fingerprint, extractor version, schema version, or an explicit refresh requires an update.

## First-Time Registration

Register a template deck:

```bash
npm run cli -- templates register \
  --id <style-id> \
  --name "<display name>" \
  --template-deck <path-to-template.pptx>
```

Register a slide library when available:

```bash
npm run cli -- libraries register \
  --style <style-id> \
  --library-deck <path-to-library.pptx>
```

Inspect registered assets:

```bash
npm run cli -- templates inspect <style-id>
npm run cli -- libraries list --style <style-id>
```

Template instructions are optional but preferred for production styles:

```bash
npm run cli -- templates instructions init <style-id>
npm run cli -- templates instructions validate <style-id>
npm run cli -- templates instructions inspect <style-id>
```

When instructions exist, the planner must choose registered layouts, include `selectionReason` on each generated slide, and fill content by `placeholderId` where possible. Do not ignore placeholder writing contracts; revise the deck spec first when a contract fails.

## Running A Deck

Run Deck Factory from an existing approved execution lane with repository filesystem access. Do not create a new OpenClaw agent as part of a deck run. If the deployment has not chosen an execution lane yet, stop and ask the operator which existing lane should run Deck Factory. Prefer `DECK_FACTORY_OPENCLAW_MODEL=<provider/model>` for schema-only planning and screenshot review so Deck Factory uses OpenClaw's tool-free `infer model run` surface for JSON worker calls.

## Computer Use Mode

Computer Use is not required to render a Deck Factory deck. Treat desktop UI control as an optional deployment capability, separate from the core deck build.

Use this default unless the user explicitly asks for desktop inspection:

```bash
DECK_FACTORY_COMPUTER_USE=off
```

When Computer Use is off, do not invoke `@Computer`, open PowerPoint through a desktop UI, inspect Telegram, or make success depend on macOS desktop control. Deck Factory must rely on its own generated `.pptx`, PowerPoint package checks, rasterized screenshots, schema-valid `qa-report.json`, and OpenClaw worker evidence.

Supported CLI modes:

- `--computer-use off`: default. No desktop UI control is used or required.
- `--computer-use optional`: the deck build still succeeds or fails without desktop UI control; an orchestrator may run a separate post-build desktop check if that path is proven ready.
- `--computer-use required`: use only for deployments that have a separate proven Computer Use verification gate. The Deck Factory CLI records the requirement but does not perform desktop UI control itself.

For an upstream skill handoff:

```bash
npm run cli -- run \
  --style "<style id or display name>" \
  --handoff <path-to-skill-deck-handoff.json> \
  --computer-use off
```

If `--out` is omitted, Deck Factory writes to:

```text
artifacts/<subject-slug>-<report-type-slug>-<style-id>/deck.pptx
```

For an approved deck spec:

```bash
npm run cli -- run \
  --style "<style id or display name>" \
  --spec <path-to-deck-spec.json> \
  --out <run-directory> \
  --computer-use off
```

## QA Gates

Do not call a deck final until Deck Factory has:

- written `run-summary.json`
- passed template security scanning
- passed template compliance checks when template instructions exist
- rendered an editable `.pptx`
- passed PowerPoint package-integrity checks
- rasterized every slide to PNG
- produced a schema-valid severity-coded `qa-report.json`
- produced `product-quality-report.json`
- written runtime provenance and source-map artifacts
- completed OpenClaw screenshot review when the run path invokes it
- completed configured repair attempts or failed with a concrete blocker

The final user-facing artifact is:

```text
<run-directory>/deck.pptx
```

Internal evidence stays in the run directory:

- `deck-spec.json`
- `capabilities.json`
- `run-summary.json`
- `template-compliance-report.json`
- `template-security-report.json`
- `runtime-provenance.json`
- `source-map.json`
- `product-quality-report.json`
- `operations.jsonl`
- `qa-report.json`
- `screenshots/`
- `openclaw-*/*`

Return evidence only when the user asks or when explaining a failure.

## Optional Artifact Publishing

Deck Factory can optionally publish the final `deck.pptx` through an external artifact publisher after render and required QA gates pass.

Use `--product-quality strict` or `DECK_FACTORY_PRODUCT_QUALITY=strict` for
client-delivery runs. Do not publish a deck that failed strict product-quality
review, even if render, deterministic QA, and screenshot review passed.

Default behavior:

- Do not publish unless the user, local config, or calling workflow explicitly requests it.
- Do not publish failed or QA-blocked decks.
- Do not publish product-quality-blocked decks.
- Do not publish internal evidence unless the user asks for an approval package or evidence bundle.
- Keep `deck.pptx` as the primary user-facing artifact.

Tailnet Artifact Gateway mode:

```bash
npm run cli -- run \
  --style <style-id> \
  --handoff <handoff.json> \
  --computer-use off \
  --publish tailnet-gateway \
  --publish-ttl 24h
```

When publishing succeeds, Deck Factory writes:

```text
<out>/publish-result.json
```

The final response should include the URL from `publish-result.json` and the local deck path.

When publishing is optional and fails, still return the local deck path if the deck itself passed render and QA. Report the publishing failure clearly.

When publishing is required and fails, report a blocker and preserve the local deck path for recovery.

## Blockers

Stop and report the exact missing prerequisite when:

- OpenClaw is unavailable
- no approved existing OpenClaw execution lane is available
- model credentials are unavailable through OpenClaw
- LibreOffice, ImageMagick, or Ghostscript is missing
- the requested style is not registered
- the source template or slide-library deck is missing when refresh is required
- the template deck is not a prepared `.pptx`
- a slide library entry is missing or lacks required fields
- schema validation fails
- template security or template compliance has blocker findings
- rendering, package integrity, rasterization, QA, or repair fails

## Final Response Contract

On success, return the final deck path and a short verification summary. Include the status from `run-summary.json`, the QA status, and any blocker count. On failure, return the blocker, the failing command or artifact path, and the next operator action. Do not bury the deck path in verbose logs.

## Final Response Contract With Publishing

If `<out>/publish-result.json` exists and contains a valid non-expired URL, include:

```text
Done: <download-url>
Local deck: <out>/deck.pptx
```

If publishing was not enabled, include:

```text
Done: <out>/deck.pptx
```

If publishing was enabled but optional and failed, include:

```text
Done: <out>/deck.pptx
Publishing did not complete: <reason>
```

If publishing was required and failed, stop with:

```text
BLOCKER: The deck was rendered and preserved at <out>/deck.pptx, but required artifact publishing failed.
Reason: <reason>
```

Do not claim a downloadable URL exists unless `publish-result.json` was written and validated.
