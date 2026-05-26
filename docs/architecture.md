# Architecture

Deck Factory should be built as a narrow, inspectable pipeline. Each stage should have a clear input, output, and validation boundary so agents can reason about the work without bypassing the hard checks.

## Proposed Modules

```text
deck-factory
  template-profiler
  spec-schema
  planner
  renderer-adapter
  visual-qa
  repair-loop
  capability-gates
  openclaw-skill
  approval-bundler
```

## Template Profiler

Input:

- `.pptx` template

Output:

- `template-profile.json`

Responsibilities:

- inspect slide size, theme colors, fonts, masters, layouts, placeholders, and reusable shapes
- identify canonical layouts such as title, section, content, comparison, chart, table, quote, and appendix
- report missing or unsupported template features

## Spec Schema

Input:

- structured deck brief
- template profile

Output:

- schema-valid `deck-spec.json`

Responsibilities:

- define the deck, slide, asset, citation, speaker-note, and constraint models
- validate before render
- keep ambiguous narrative decisions visible to the model rather than hidden in deterministic heuristics

## Planner

Input:

- brief
- source material
- template profile

Output:

- `deck-spec.json`

Responsibilities:

- choose narrative structure
- map content to available layouts
- request missing assets or facts
- preserve citations and reviewer notes
- decide whether each output slide should be generated from a template layout or selected from a registered slide library

The planner is an OpenClaw worker boundary. It receives bounded JSON context, including the handoff, style pack, cached template profile, and slide-library index. It returns only schema-valid `deck-spec.json`.

## Renderer Adapter

Input:

- `deck-spec.json`
- `template-profile.json`
- assets

Output:

- `deck.pptx`
- `operations.jsonl`

Responsibilities:

- translate structured slide intent into deterministic PowerPoint operations
- keep output editable
- emit operation logs for debugging and repair
- wrap existing libraries instead of writing a custom renderer

V0 renderer decision:

- Start with a thin Deck Factory adapter over `pptx-automizer`.
- Use `PptxGenJS` through that layer when new dynamic elements are required.
- Study `agent-slides` as a reference architecture for extraction, validation, and agent workflow ergonomics.
- Keep the adapter boundary narrow enough that another renderer can be swapped in later.

## Visual QA

Input:

- rendered `.pptx`

Output:

- `screenshots/`
- `qa-report.json`

Responsibilities:

- render every slide to an image
- check text overflow, clipped shapes, overlaps, out-of-bounds elements, low contrast, missing images, unsupported fonts, and slide count mismatches
- generate human-readable montages for fast review

## Capability Gates

Input:

- run options
- environment variables
- deployment-specific agent readiness

Output:

- `capabilities.json`

Responsibilities:

- record whether Computer Use is `off`, `optional`, or externally `required`
- keep deck rendering and QA independent from desktop UI control when Computer Use is off
- prevent agents from treating `@Computer` readiness as implied by a successful deck render
- make optional or required desktop verification visible in the run artifacts instead of hidden in prompt text

## Repair Loop

Input:

- deck spec
- operations log
- screenshots
- QA report

Output:

- revised deck spec or operation patch

Responsibilities:

- let the model inspect concrete failures
- revise the deck spec first: layout choices, copy length, asset usage, or slide splits
- patch slide operations directly only for renderer-specific technical fixes that cannot be represented cleanly in the spec
- re-render until the deck passes required checks or fails with a clear blocker

## OpenClaw Skill

Input:

- user request or upstream `skill-deck-handoff.json`
- registered style id or user-facing style name
- optional output directory override
- Computer Use mode

Output:

- final `deck.pptx`

Responsibilities:

- let OpenClaw agents call the local CLI instead of editing PowerPoint files directly
- resolve style names through the local registry
- reuse cached template and slide-library profiles when fingerprints are current
- choose deterministic output paths for agent-initiated runs
- default to `--computer-use off` unless desktop verification is explicitly requested and proven available
- stop with exact setup guidance when OpenClaw, templates, slide libraries, rasterizers, or credentials are missing
- keep `deck.pptx` as the primary user-facing artifact

The public skill must not assume Brian-specific hosts, paths, or agent ids. Local overrides belong in environment variables, CLI flags, or OpenClaw user configuration.

## Approval Bundler

Input:

- final `.pptx`
- screenshots
- QA report
- source notes

Output:

- approval bundle

Responsibilities:

- deliver the `.pptx` as the primary user-facing artifact
- keep screenshots, QA reports, operation logs, source specs, and repair attempts as internal evidence by default
- summarize what was rendered, what was verified, and what needs human review
- preserve artifacts for client or internal QA

## Implementation Bias

Use existing package-native APIs first. Build custom code around the contract, schemas, validation, and orchestration. Patch renderer internals only if documented extension points cannot support the required behavior.
