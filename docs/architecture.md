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
- start with an adapter around existing libraries before writing a custom renderer

Candidate renderer layers:

- `pptx-automizer`
- `PptxGenJS`
- `agent-slides`
- `pptx.dev` or OpenPresentation adapters where appropriate

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
- revise layout choices, copy length, asset usage, or slide splits
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

- collect the deliverable and evidence in one folder
- summarize what was rendered, what was verified, and what needs human review
- preserve artifacts for client or internal QA

## Implementation Bias

Use existing package-native APIs first. Build custom code around the contract, schemas, validation, and orchestration. Patch renderer internals only if documented extension points cannot support the required behavior.
