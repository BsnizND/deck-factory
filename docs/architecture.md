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
