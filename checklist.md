# Deck Factory Hardening Checklist

This checklist consolidates `docs/deck-factory-hardening-slash-goal.md`, `docs/roadmap.md`, `docs/execution-plan.md`, `docs/slide-template-instructions.md`, and the current implementation state.

## Scope Guardrails

- [x] Keep Deck Factory focused on the local deck-production pipeline, not a web service.
- [x] Keep `deck.pptx` as the primary user-facing artifact.
- [x] Keep internal evidence in the run directory unless explicitly requested.
- [x] Keep Computer Use off by default.
- [x] Keep public defaults free of Brian-specific hosts, paths, and agent ids.
- [x] Fail closed on blockers; do not emit fake decks, fake QA, fake screenshots, or fake OpenClaw results.

## Work Package 1: Canonical Run Contract

- [x] Add shared severity values: `BLOCKER`, `MAJOR`, `MINOR`, `INFO`.
- [x] Add typed run statuses: `pending`, `running`, `passed`, `failed`, `blocked`, `repaired`.
- [x] Track required gates from input validation through handoff artifact creation.
- [x] Emit `<out>/run-summary.json`.
- [x] Make required gate failures explicit and non-zero from the CLI.

## Work Package 2: Template Instructions Sidecar

- [x] Add `schemas/template-instructions.schema.json`.
- [x] Add TypeScript loader/types for `template-instructions.json`.
- [x] Store instructions under a stable registry path.
- [x] Add `templates instructions init <style-id>`.
- [x] Add `templates instructions validate <style-id>`.
- [x] Add `templates instructions inspect <style-id>`.
- [x] Allow styles with no instructions to keep existing behavior.
- [x] Keep `template-profile.json` factual and machine-generated.

## Work Package 3: Template-Aware Deck Spec Validation

- [x] Extend `deck-spec.schema.json` for `selectionReason`, placeholder-addressed content, and asset selection reasons.
- [x] Validate selected layouts against the template profile.
- [x] Validate required and unknown placeholders against template instructions when present.
- [x] Validate placeholder min/max item counts and character limits.
- [x] Enforce citation and asset requirements where configured.
- [x] Emit severity-coded compliance findings instead of silent planner drift.

## Work Package 4: OpenClaw Planning And Repair Context

- [x] Feed bounded template instructions into planner context.
- [x] Prompt the planner to choose registered layouts and include `selectionReason` when instructions exist.
- [x] Prompt the planner to fill content by placeholder id when instructions exist.
- [x] Feed template-compliance findings into repair context.
- [x] Keep OpenClaw out of direct PowerPoint/OOXML editing.

## Work Package 5: Template Compliance Report

- [x] Emit `<out>/template-compliance-report.json`.
- [x] Include slide-level layout and placeholder compliance.
- [x] Include unknown placeholders, missing required placeholders, assets, citations, and contract violations.
- [x] Integrate compliance status into `run-summary.json`.
- [x] Mention compliance evidence in docs and OpenClaw final-response guidance.

## Work Package 6: Deterministic QA Hardening

- [x] Upgrade `qa-report.json` with severity-coded findings.
- [x] Preserve existing report fields for compatibility.
- [x] Map render, package, rasterization, overflow, asset, contrast, overlap, and font findings into the shared severity model.
- [x] Fail on `BLOCKER`; fail on `MAJOR` in strict mode where implemented.
- [x] Emit `screenshots/contact-sheet.png` when screenshots are available.

## Work Package 7: Runtime Provenance

- [x] Emit `<out>/runtime-provenance.json`.
- [x] Capture OS/platform, Node version, package version, renderer adapter, rasterizer tool versions, command names, template fonts, and timestamp.
- [x] Include provenance path in `run-summary.json`.

## Work Package 8: Template Security Scan

- [x] Add conservative `.pptx` package security scan.
- [x] Emit `template-security-report.json` at registration and per run.
- [x] Detect macro-enabled inputs, external relationships, embedded/OLE-like files, media, hidden slides, notes, comments, document metadata, unusual parts, and missing targets where feasible.
- [x] Map findings into the shared severity model.
- [x] Make external relationships and macros blockers by default.

## Work Package 9: Source Map

- [x] Emit `<out>/source-map.json`.
- [x] Map slides to title/action title, handoff sections, citations, assets, library slide id, template layout id, and layout selection reason.
- [x] Include source-map path in `run-summary.json`.

## Work Package 10: Golden Template Gauntlet

- [x] Add tests for valid template instructions.
- [x] Add tests for placeholder contract violations.
- [x] Add tests for security blockers.
- [x] Add tests for compliance/source/provenance artifacts.
- [x] Add `npm run test:gauntlet`.

## Work Package 11: Docs And Skill Updates

- [x] Update README and docs for the run contract, template instructions, reports, severity model, security scan, provenance, source map, and gauntlet.
- [x] Update `openclaw/skills/deck-factory/SKILL.md` final response and blocker guidance.
- [x] Keep guidance centered on the CLI and registered styles.

## Work Package 12: Optional Publishing

- [x] Do not implement a web server here.
- [x] Leave a small TODO/extension note only if publishing remains out of scope.

## Required Validation

- [x] `npm install`
- [x] `npm run build`
- [x] `npm run check`
- [x] `npm test`
- [x] `npm run cli -- doctor --json` attempted; it correctly reports an OpenClaw setup blocker for missing `deck-factory-planner`.
- [x] `npm run check:skill`
- [x] `npm run smoke:public`
- [x] `npm run test:gauntlet`
- [x] Final git state committed, pushed, merged to `main`, and clean; see closeout evidence in the final response.
