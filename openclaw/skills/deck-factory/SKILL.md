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

Do not hand-edit PowerPoint XML, OOXML package parts, or slide screenshots directly. Do not create placeholder decks, fake QA reports, canned screenshots, or success-looking output after a failed run. Do not call model providers directly from Deck Factory code; model judgment must go through the configured OpenClaw worker lanes.

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

## Running A Deck

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

- rendered an editable `.pptx`
- passed PowerPoint package-integrity checks
- rasterized every slide to PNG
- produced a schema-valid `qa-report.json`
- completed OpenClaw screenshot review when the run path invokes it
- completed configured repair attempts or failed with a concrete blocker

The final user-facing artifact is:

```text
<run-directory>/deck.pptx
```

Internal evidence stays in the run directory:

- `deck-spec.json`
- `capabilities.json`
- `operations.jsonl`
- `qa-report.json`
- `screenshots/`
- `openclaw-*/*`

Return evidence only when the user asks or when explaining a failure.

## Blockers

Stop and report the exact missing prerequisite when:

- OpenClaw is unavailable
- the configured worker agent does not exist
- model credentials are unavailable through OpenClaw
- LibreOffice, ImageMagick, or Ghostscript is missing
- the requested style is not registered
- the source template or slide-library deck is missing when refresh is required
- the template deck is not a prepared `.pptx`
- a slide library entry is missing or lacks required fields
- schema validation fails
- rendering, package integrity, rasterization, QA, or repair fails

## Final Response Contract

On success, return the final deck path and a short verification summary. On failure, return the blocker, the failing command or artifact path, and the next operator action. Do not bury the deck path in verbose logs.
