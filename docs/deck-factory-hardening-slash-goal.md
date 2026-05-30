# Slash Goal: Harden Deck Factory Into a More Production-Ready Template-Aware Deck Pipeline

Use this as the goal prompt for Codex from the root of the existing `deck-factory` repository.

```text
/goal
You are working in the existing Deck Factory repository. Implement the next production-hardening slice for Deck Factory itself. This is NOT the tailnet artifact gateway project. Do not build a web server here. Keep Deck Factory focused on the narrow, inspectable deck-production pipeline:

  template.pptx
  -> template profile
  -> template instructions
  -> deck spec
  -> render
  -> QA
  -> repair
  -> approval / handoff artifacts

Your job is to upgrade Deck Factory so agents can use templates more intelligently, QA is more reliable, and production runs have stricter pass/fail evidence.

First, inspect the repository before changing anything:

  - package.json
  - src/**
  - openclaw/skills/deck-factory/**
  - docs/** or project markdown files
  - samples/**
  - tests/**
  - current CLI commands
  - current schema files
  - current QA and renderer code

Adapt to the actual repo structure. Do not invent parallel directories if equivalent modules already exist. Preserve the existing public CLI and smoke paths unless there is a strong reason to change them. If you need to add new commands, add them compatibly.

Non-negotiable principles:

  - Keep `deck.pptx` as the primary user-facing artifact.
  - Keep internal evidence in the run directory unless explicitly requested.
  - Keep the authored deck spec semantic; do not push low-level coordinates into the planner unless unavoidable.
  - Prefer spec-first repair over operation patching.
  - Keep Computer Use off by default.
  - Do not require Brian-specific hosts, paths, agents, or machine names in public defaults.
  - Do not fake successful decks, QA reports, screenshots, fixture outputs, or OpenClaw results.
  - Do not silently ignore blockers.
  - Do not make the renderer a web service.
  - Do not rewrite the whole app. Make a well-scoped, testable hardening slice.

Implement the following work packages end to end.

---

## 1. Add a canonical run contract / pass-fail state machine

Create a single canonical run contract used by the CLI, QA, repair loop, approval bundler, and OpenClaw skill docs.

The run should only be considered successful when all required gates pass:

  1. input handoff/deck brief is present and schema-valid
  2. style resolves to a registered template
  3. template profile is present/current or safely refreshed
  4. template security scan passes required gates
  5. template instructions are loaded when configured
  6. deck spec is schema-valid
  7. deck spec satisfies template-instruction placeholder requirements
  8. required assets exist and are readable
  9. render succeeds
  10. package integrity passes
  11. every slide rasterizes
  12. deterministic QA has no blocker-level findings
  13. agentic screenshot review, if configured/available, has no unresolved blocker-level findings
  14. repair attempts are either unnecessary or exhausted with a clear failure
  15. final `deck.pptx` is written
  16. approval/handoff artifacts are written

Add a shared severity model:

  - BLOCKER: must fail the run
  - MAJOR: should fail when strict QA is enabled; warn otherwise
  - MINOR: warn only
  - INFO: evidence/provenance only

Define typed run statuses such as:

  - pending
  - running
  - passed
  - failed
  - blocked
  - repaired

Write a run summary artifact, for example:

  <out>/run-summary.json

It should include:

  - schema version
  - status
  - startedAt / completedAt
  - style id
  - input handoff path
  - output deck path
  - number of slides
  - gates run
  - gate results
  - blocker findings
  - repair attempts
  - artifact paths

Update the CLI so failures are explicit and exit non-zero when a required gate fails.

---

## 2. Promote `template-instructions.json` to a first-class sidecar

Add a versioned schema and TypeScript types for a human-editable template instruction sidecar.

Suggested artifact:

  registry/templates/<style-id>/template-instructions.json

or the closest equivalent path in the existing registry structure.

The extracted `template-profile.json` should remain factual and machine-generated. The `template-instructions.json` sidecar should contain editable guidance for planning and validation.

Minimum schema:

  {
    "version": "0.1",
    "styleId": "...",
    "layoutInstructions": [
      {
        "layoutId": "...",
        "displayName": "...",
        "slideKind": "recommendation|section|content|comparison|chart|table|quote|appendix|custom",
        "narrativeRole": "...",
        "useWhen": ["..."],
        "avoidWhen": ["..."],
        "worksFor": ["..."],
        "contentVoice": "...",
        "requiredPlaceholders": ["df_title"],
        "optionalPlaceholders": ["df_footer"],
        "placeholderContracts": {
          "df_title": {
            "role": "action-title",
            "contentKind": "single-sentence claim",
            "writeAs": "State the slide takeaway, not the topic.",
            "voice": "direct and specific",
            "minItems": 1,
            "maxItems": 1,
            "maxCharacters": 105,
            "maxCharactersPerItem": null,
            "requiresCitations": false,
            "requiresAsset": false,
            "validationHints": ["..."]
          }
        },
        "assetGuidance": {
          "imageRole": "...",
          "imageShouldShow": "...",
          "avoid": ["..."]
        }
      }
    ]
  }

Support the sidecar in registration and inspection flows. Add whichever CLI surface best fits the existing code, such as:

  npm run cli -- templates instructions init <style-id>
  npm run cli -- templates instructions validate <style-id>
  npm run cli -- templates instructions inspect <style-id>

or:

  npm run cli -- templates register --instructions path/to/template-instructions.json

Acceptance:

  - A style can have no instructions and still use current behavior.
  - A style with instructions loads them into planner context.
  - Invalid instructions fail with useful errors.
  - Missing required layout ids or placeholder ids are reported.
  - The extracted template profile remains machine-generated and is not polluted with editorial guidance.

---

## 3. Extend deck-spec validation to understand layout selection and placeholder contracts

Update the deck spec schema/types so each generated slide can carry template-aware planning intent.

At minimum, each generated slide should support:

  - `layout` or `layoutId`
  - `purpose`
  - `selectionReason`
  - placeholder-addressed content blocks
  - asset selection reasons where assets are used

Example:

  {
    "id": "slide-05",
    "layout": "recommendation-3-proof-points",
    "purpose": "Recommend the highest-leverage launch path.",
    "selectionReason": "This slide needs one decision and three concise reasons.",
    "content": [
      {
        "placeholderId": "df_action_title",
        "value": "Launch with loyalty-led trial because it links demand creation to measurable repeat behavior."
      },
      {
        "placeholderId": "df_proof_points",
        "items": ["...", "...", "..."]
      }
    ],
    "assets": [
      {
        "placeholderId": "df_image",
        "assetId": "loyalty-app-screenshot",
        "selectionReason": "Shows the actual customer interaction instead of generic category imagery."
      }
    ]
  }

Add validation that checks a deck spec against both the template profile and template instructions:

  - selected layout exists
  - required placeholders are filled
  - unknown placeholder ids fail
  - required assets are present
  - min/max item counts pass
  - max character counts pass or generate severity-coded findings
  - citation requirements are enforced where configured
  - `selectionReason` exists when instructions are present

Do not break existing deck specs unnecessarily. If the existing schema uses different names, support a compatibility layer or migration where reasonable.

---

## 4. Feed template instructions into OpenClaw planning and repair

Update the planner context assembly so OpenClaw receives bounded, relevant template instructions alongside the handoff, style pack, template profile, and slide-library index.

The planner prompt/worker call should require:

  - choose layouts from available layouts
  - include `selectionReason` for each generated slide when template instructions exist
  - fill content by placeholder id when possible
  - respect placeholder writing contracts
  - use slide-library ids only when registered
  - fail or request missing assets/facts rather than hallucinating them

Update repair prompts so that when a slide violates a placeholder contract, the repair prompt cites the relevant contract and asks for a revised deck spec first.

Do not ask OpenClaw to edit PowerPoint or OOXML directly.

---

## 5. Add `template-compliance-report.json`

Create a dedicated template-compliance report emitted per run:

  <out>/template-compliance-report.json

It should answer whether the rendered deck followed the selected template contract.

Suggested structure:

  {
    "version": "0.1",
    "status": "passed|failed|warning",
    "slides": [
      {
        "slideId": "slide-04",
        "layoutId": "recommendation-3-proof-points",
        "usedRegisteredLayout": true,
        "allRequiredPlaceholdersFilled": true,
        "unknownPlaceholders": [],
        "missingRequiredPlaceholders": [],
        "unregisteredFonts": [],
        "unregisteredColors": [],
        "allObjectsEditable": true,
        "noFlattenedSlideImages": true,
        "slideLibrarySourceId": null,
        "findings": []
      }
    ],
    "findings": []
  }

Integrate this report into:

  - run summary
  - approval summary
  - failure output
  - OpenClaw final-response guidance

Do not rely only on screenshot QA for template compliance.

---

## 6. Harden deterministic QA and severity-coded findings

Upgrade `qa-report.json` to be versioned and severity-coded.

At minimum, findings should have:

  - id
  - severity: BLOCKER|MAJOR|MINOR|INFO
  - category
  - slide id/index
  - object id/name if known
  - message
  - evidence
  - suggested repair intent

Implement or strengthen checks for:

  - slide count mismatch
  - render failure
  - package integrity failure
  - slide rasterization failure
  - missing assets
  - out-of-bounds objects
  - clipped or likely overflowing text
  - severe unintended overlaps
  - low contrast where text/background colors can be inferred
  - font substitution or unavailable required fonts
  - required placeholder left empty
  - flattened whole-slide image where editable objects are expected

Add a contact sheet/montage artifact when screenshots are available, for example:

  <out>/screenshots/contact-sheet.png

If some checks are heuristic, report confidence and avoid pretending they are perfect. But still make blockers hard failures.

---

## 7. Add font and rasterizer provenance

Create a runtime provenance artifact, for example:

  <out>/runtime-provenance.json

or extend `capabilities.json` if that is the better existing home.

It should include:

  - OS/platform
  - Node version
  - package version
  - renderer adapter name/version if available
  - LibreOffice version
  - ImageMagick version
  - Ghostscript version
  - rasterization commands used
  - fonts required by template
  - fonts detected/available in the render environment where feasible
  - inferred or observed font substitutions
  - timestamp

Add this provenance to run summary and approval summary.

Font handling should not be buried in logs. A missing brand font is a production issue.

---

## 8. Add template security and sanitation scanning

Because Deck Factory accepts user-supplied `.pptx` files, add a template security scan.

Emit:

  <out>/template-security-report.json

or a registration-time report if that better fits the current code.

Minimum checks:

  - reject `.pptm` by default
  - detect external relationships / remote links
  - detect embedded files / OLE-like objects where feasible
  - detect embedded media
  - detect hidden slides
  - detect comments and speaker notes
  - detect custom document properties and creator/company metadata
  - detect unusual package parts or relationship targets
  - ensure asset paths are restricted to the run workspace or configured asset roots

Add options only when needed, such as:

  --allow-external-relationships
  --allow-embedded-media
  --strip-metadata

Defaults should be conservative. Do not fetch remote assets unless an explicit feature already exists and is clearly enabled.

Security findings should map to the shared severity model. External relationships and macros should be BLOCKER by default.

---

## 9. Add a source/provenance map for deck content

Emit:

  <out>/source-map.json

It should map:

  - slide id
  - slide title/action title
  - source handoff sections/findings
  - citations used
  - assets used
  - slide-library source id, if any
  - template layout id
  - layout selection reason

This does not need to be perfect, but it should make client/internal review easier and make repair prompts more grounded.

---

## 10. Build a golden-template gauntlet / regression suite

Add a regression suite that proves Deck Factory behaves correctly across good and bad templates/specs.

Prefer real PPTX fixtures. If the repo lacks enough fixtures, create small fixture generators using the existing PowerPoint generation stack so tests generate real `.pptx` inputs. Do not use fake text files pretending to be PPTX files.

Add fixtures or generated fixtures for at least:

  - simple happy-path template
  - dense slide that should trigger overflow/crowding
  - wrong/missing placeholder id
  - missing required asset
  - missing required font or font substitution warning
  - poor contrast warning
  - out-of-bounds object
  - slide-library parameter missing required field
  - external relationship/security blocker, if feasible
  - hidden slide/comment/speaker-note warning, if feasible

Add tests that assert:

  - good fixtures pass
  - bad fixtures fail for the right reason
  - blocker findings exit non-zero
  - repair loop can fix at least one dense-slide case by revising the deck spec
  - repair loop can fix at least one layout-mismatch case by revising the deck spec
  - template-instruction validation catches placeholder contract violations
  - template-compliance report is emitted
  - runtime provenance is emitted
  - source map is emitted

Expose a script if appropriate:

  npm run test:gauntlet

or integrate into the existing test suite if that is cleaner.

---

## 11. Update docs and OpenClaw skill guidance

Update README/docs/OpenClaw skill docs to explain:

  - the new run contract
  - template-instructions sidecar
  - placeholder writing contracts
  - template-compliance report
  - QA severity model
  - font/rasterizer provenance
  - security scan behavior
  - source-map artifact
  - golden-template regression tests
  - what final response should include
  - when to return only `deck.pptx` versus an approval package

The OpenClaw skill should keep telling agents:

  - call the Deck Factory CLI, do not hand-edit PowerPoint/OOXML
  - use registered styles
  - reuse current cached template/library profiles
  - pass `--computer-use off` unless explicitly requested and proven available
  - return `deck.pptx` as the primary artifact
  - summarize QA evidence only when needed or requested
  - stop with exact setup guidance on blockers

---

## 12. Optional: leave a clean extension point for artifact publishing, but do not implement the server here

If the previous artifact gateway integration is not already implemented in this repo, you may add a narrow optional publisher interface only if it is small and does not distract from the hardening work.

Do not build the tailnet artifact server in Deck Factory.

Acceptable Deck Factory-side shape:

  - `--publish none|custom-command|tailnet-gateway` if already planned
  - `--publish-required`
  - `--publish-ttl`
  - `--artifact-gateway-command`
  - `<out>/publish-result.json`

Publishing must happen only after render and required QA gates pass. Publishing must not bypass blockers.

If this scope threatens the main work packages, skip it and leave a TODO linked to the artifact gateway project.

---

## Required validation before finishing

Run the strongest available checks in this repo. At minimum try:

  npm install
  npm run build
  npm run check
  npm test
  npm run cli -- doctor --json

Also run any existing or newly added smoke/static checks, such as:

  npm run check:skill
  npm run smoke:public
  npm run test:gauntlet

If any command does not exist, do not invent a passing result. Either add the script if it belongs to this work or report that it is not present.

If external tools are missing, report exact blockers:

  - OpenClaw missing when required
  - worker auth/profile missing when required
  - LibreOffice missing
  - ImageMagick missing
  - Ghostscript missing
  - template/source assets missing
  - package integrity failure
  - rasterization failure
  - final deck write failure

Do not ship mock decks, fake QA reports, placeholder screenshots, or “looks successful” output after a blocker.

---

## Deliverables

By the end, the repository should contain:

  - updated schemas/types for template instructions and stricter deck spec validation
  - loader/registry support for `template-instructions.json`
  - planner/repair prompt updates using template instructions
  - severity-coded `qa-report.json`
  - `template-compliance-report.json`
  - `template-security-report.json` or registration-time equivalent
  - `runtime-provenance.json` or equivalent in `capabilities.json`
  - `source-map.json`
  - `run-summary.json`
  - contact-sheet/montage support when screenshots exist
  - golden-template/fixture regression tests
  - docs and OpenClaw skill updates
  - passing build/check/test/smoke results, or a clear blocker report with exact failures

---

## Final response format

When done, report:

  1. What changed
  2. New CLI commands/options
  3. New artifacts emitted
  4. Tests/smokes run and exact results
  5. Any blockers or known limitations
  6. Files changed
  7. Whether the repo is clean

Be honest. If something could not be completed, say exactly what is missing and what should happen next.
```
