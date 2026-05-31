# Execution Plan

This is the ready-to-handoff plan for finishing Deck Factory from its current local v0 state to a public, portable OpenClaw-ready project.

## Current Baseline

Deck Factory currently has:

- a TypeScript CLI
- schema validation
- sample `.pptx` template and slide-library fixtures
- template/style/slide-library registries
- cached template profiles and slide-library indexes
- `pptx-automizer` rendering
- editable `deck.pptx` output
- screenshot rasterization through LibreOffice, ImageMagick, and Ghostscript
- deterministic QA for slide count, text length, rasterization, and PowerPoint package integrity
- OpenClaw JSON worker calls for planning, screenshot review, and spec-first repair
- a repo-shipped OpenClaw skill package under `openclaw/skills/deck-factory`
- portable OpenClaw command and worker-agent defaults with env/CLI overrides
- explicit Computer Use mode support with `off` as the default
- deterministic handoff output directories when `--out` is omitted
- public smoke scripts
- a sample 5C handoff path

The main remaining gap after the public integration slice is deeper renderer/QA hardening and richer real-world template coverage.

## End State

Deck Factory is done when a user can:

1. clone the repo
2. install dependencies
3. run health checks
4. install or reference the Deck Factory OpenClaw skill
5. register a prepared `.pptx` template deck once
6. optionally register a slide library once
7. ask an OpenClaw agent for a deck in that registered style
8. have the agent consume or produce a schema-valid `skill-deck-handoff.json`
9. render, QA, repair, and verify the deck without requiring Computer Use
10. receive `<out>/deck.pptx`

The repo must not require Brian-specific paths, `snizserver`, or a `jay` agent for the public path. Those can exist as local deployment overrides only.

## Work Package 1: Public OpenClaw Skill

Status: implemented.

Delivered:

- `openclaw/skills/deck-factory/SKILL.md`
- skill examples under `openclaw/skills/deck-factory/examples/`
- static skill check under `openclaw/skills/deck-factory/tests/`

The skill must explain:

- when to use Deck Factory
- when not to use it
- template deck requirements
- slide-library requirements
- style-name resolution
- handoff contract
- output-path convention
- Computer Use mode contract
- required commands
- QA gates
- failure/blocker handling
- final response contract

Acceptance:

- the skill file exists and is readable
- static check verifies required sections
- static check rejects Brian-specific public defaults
- examples use portable paths or explicitly marked local overrides
- the skill tells agents to call the CLI rather than hand-editing PowerPoint/OOXML
- the skill tells agents to use `--computer-use off` unless desktop verification is explicitly requested and proven available

## Work Package 2: Portable Configuration

Status: implemented.

Delivered:

- public default command behavior that prefers local `openclaw`
- env var support for approved existing worker agent defaults, including `DECK_FACTORY_OPENCLAW_AGENT`
- docs for `DECK_FACTORY_OPENCLAW_COMMAND`, `--openclaw-command`, `--planner-agent`, and related overrides
- local deployment note for Brian-specific `ssh snizserver openclaw`
- Computer Use mode support through `DECK_FACTORY_COMPUTER_USE` and `--computer-use`

Acceptance:

- public docs do not present `ssh snizserver openclaw` or `jay` as required defaults
- Deck Factory no longer fabricates a `deck-factory-planner` default agent; handoffs require `DECK_FACTORY_OPENCLAW_AGENT` or `--planner-agent`
- `doctor --json` reports OpenClaw readiness without mutating state
- `doctor --json --computer-use off` reports that desktop UI control is disabled rather than required
- missing OpenClaw fails with an exact prerequisite message
- missing worker agent/auth fails with exact OpenClaw commands or checks

## Work Package 3: Style, Template, And Library Onboarding

Status: implemented for public v0 onboarding.

Delivered:

- clear "bring your own template" guide
- clear "bring your own slide library" guide
- style-name resolution implementation or documented helper surface
- template prep report language that a PowerPoint user can follow
- slide library prep report language that explains `DF_LIBRARY`, `DF_KIND`, and `{{field}}`

Acceptance:

- a user can register a new prepared `.pptx` template deck
- a user can register an optional `.pptx` slide library
- unknown style names fail with a template-registration request
- stale cache states are detected and either refreshed or blocked with exact missing-source instructions
- unchanged templates and libraries are reused without re-extraction

## Work Package 4: Agent Output Convention

Status: implemented.

Delivered:

- deterministic run directory naming for agent-initiated runs:

```text
artifacts/<subject-slug>-<report-type-slug>-<style-id>/
```

- optional CLI/helper support if needed
- README and skill examples showing where outputs go

Acceptance:

- sample 5C request writes to a predictable run directory
- final deck is always `<out>/deck.pptx`
- internal evidence remains in the run directory
- final response returns the deck path and only summarizes evidence unless asked

## Work Package 5: Clean-Clone Smoke Path

Status: implemented.

Delivered:

- one documented command bundle or script that validates a fresh clone
- one sample path from template registration to handoff run to `deck.pptx`

The smoke should cover:

```bash
npm install
npm run build
npm run check
npm test
npm run cli -- doctor --json
npm run cli -- templates register ...
npm run cli -- libraries register ...
npm run cli -- run --style ... --handoff ... --out ...
```

Acceptance:

- the smoke produces a final PowerPoint deck
- the deck passes package-integrity QA
- the deck can be rasterized
- the run proves template/library cache reuse on a second execution
- smoke output is documented and reproducible

## Work Package 6: Remaining Renderer And QA Hardening

Status: next major product-hardening track.

Deliver:

- stronger deterministic checks for overlap, bounds, contrast, missing assets, and font substitution
- better template-profile extraction for placeholders, shapes, fonts, colors, charts, and tables
- optional contact sheet or montage artifact
- more sample templates beyond Snizco fixture

Acceptance:

- bad fixtures fail for the right reason
- good fixtures pass
- repair loop fixes at least one dense-slide and one layout-mismatch case
- QA findings are clear enough for an agent to repair the spec

## Work Package 7: Publish-Ready Polish

Status: partially implemented; continue after renderer/QA hardening.

Deliver:

- README public setup section
- docs indexed from README
- sample files explained clearly
- versioned release notes or changelog
- GitHub repo clean on `main`

Acceptance:

- no public docs require private paths or private hosts
- no placeholder success claims
- no untracked required files
- `npm run build`, `npm run check`, `npm test`, static skill check, and smoke path pass
- repo is committed, pushed, merged to `main`, and clean
- Jay's Deck Factory runtime skill defaults to non-Computer-Use deck creation unless Brian explicitly asks for `@Computer`

## Execution Order

1. Build the OpenClaw skill package.
2. Make OpenClaw defaults portable.
3. Add onboarding docs for templates, styles, and slide libraries.
4. Add deterministic output-path convention.
5. Add static skill checks.
6. Add the Computer Use mode switch and keep `off` as the default.
7. Add clean-clone smoke path.
8. Run and fix the smoke until it produces `deck.pptx`.
9. Harden renderer/QA only where the integration smoke exposes real gaps.
10. Update README and docs.
11. Commit, push, merge to `main`, and leave the repo clean.

## Stop Rules

Stop and report a concrete blocker if:

- OpenClaw is not installed and the smoke requires it
- a required worker agent or auth profile is missing
- LibreOffice, ImageMagick, or Ghostscript is missing
- a required template or slide-library source file is missing
- PowerPoint package integrity fails
- the final deck cannot be written
- the repo cannot be pushed or merged cleanly

Do not ship mock decks, fake QA reports, placeholder screenshots, or "looks successful" output after a blocker.
