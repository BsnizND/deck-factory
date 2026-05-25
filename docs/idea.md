# Deck Factory Idea

Deck Factory is a production workflow for making polished, editable PowerPoint decks with agents.

The project starts from a practical frustration: generating slide content is easy, but generating a deck that survives client review is still hard. A useful deck system needs to know the template, obey the design system, render real PowerPoint files, inspect screenshots, repair visual issues, and produce artifacts that a human can confidently approve.

## The Short Version

Deck Factory turns this:

```text
"Build the strategy deck from this brief using our client template."
```

into this:

```text
brief + template.pptx + source assets
  -> plan
  -> slide spec
  -> rendered PPTX
  -> screenshot QA
  -> repair loop
  -> approval bundle
```

## The Contract

The central contract is:

```text
template.pptx -> template profile -> deck spec -> slide ops -> render -> QA -> repair -> approval
```

Each stage should leave a durable artifact:

- `template-profile.json`: layouts, fonts, colors, placeholders, masters, theme metadata, and reusable patterns extracted from the template.
- `deck-spec.json`: the structured intent for the deck, including slide types, narrative flow, speaker notes, assets, citations, and constraints.
- `operations.jsonl`: deterministic operations applied to create or modify slides.
- `deck.pptx`: the editable PowerPoint result.
- `screenshots/`: rendered slide images used for review.
- `qa-report.json`: bounds, overlaps, overflow, contrast, missing assets, and render warnings.
- `approval.md`: human-readable summary of what changed and what still needs review.

## Target Users

Deck Factory is for teams who need better than a one-shot slide generator:

- agencies preparing strategy, sales, research, and client-readout decks
- consultants who repeatedly produce decks inside client templates
- founders and operators turning research into pitch, board, or planning decks
- internal comms teams that need brand-safe repeatability
- agent builders who want a reliable deck-production primitive

## Why Existing Tools Are Not Enough

Many presentation AI tools are helpful for first drafts. The gap is the production loop.

The questions that matter in real work are stricter:

- Did the output follow the supplied template?
- Are all elements editable in PowerPoint?
- Did the content fit without overlaps or clipped text?
- Are fonts available or substituted?
- Are brand colors and contrast acceptable?
- Are citations, charts, and images traceable?
- Can a model inspect the rendered deck and repair it?
- Can a human reviewer see exactly what changed?

Deck Factory should be built around those questions from day one.

## Differentiator

The differentiator is not just rendering slides. It is reliable orchestration:

- extract the template rules
- ask the model to reason inside those rules
- use deterministic code for the render contract
- screenshot every slide
- fail loudly on visual and asset problems
- let the model repair the deck using concrete QA evidence
- produce an approval bundle that a human can review quickly

That makes Deck Factory closer to a deck production system than a slide toy.

## Answered V0 Decisions

- Renderer: use a thin Deck Factory adapter over `pptx-automizer`, with `PptxGenJS` available underneath for generated elements.
- Template input: accept normal `.pptx` files with representative dummy slides for v0.
- Schema: keep the authored deck spec semantic: deck intent, template reference, assets, ordered slides, content blocks, citations, and constraints.
- Template extraction: use deterministic code for factual PowerPoint metadata, then use the agent to interpret layout purpose and choose patterns.
- QA: require screenshot rendering, deterministic checks, and an agentic screenshot review and repair loop.
- Repair: rewrite the deck spec first; patch slide operations only for renderer-specific technical issues.
- Handoff: deliver `deck.pptx` as the primary artifact while keeping QA evidence internal unless requested.

See [decisions.md](decisions.md) for the full decision record.

## First Useful Demo

The first demo should be small and honest:

1. Read a real `.pptx` template.
2. Extract a minimal profile: slide sizes, layouts, theme colors, fonts, and placeholders.
3. Accept a short structured deck spec.
4. Render 3 to 5 editable slides.
5. Rasterize the result to screenshots.
6. Detect at least text overflow and out-of-bounds shapes.
7. Produce a QA report and approval bundle.

If any step fails, the run should stop with the exact missing prerequisite.

The first repo-provided templates should cover business review, strategy readout, and sales proposal use cases so users can understand how to prepare their own source decks.

## Public OpenClaw Experience

The desired public experience is not "clone a slide renderer and read the source." It is:

```text
clone repo -> install dependencies -> install Deck Factory OpenClaw skill -> register template once -> ask an OpenClaw agent for a deck -> receive deck.pptx
```

For example:

```text
"Do a 5C research report on Chick-fil-A in a deck in Snizco Agency style."
```

The agent should resolve `Snizco Agency style` to a registered style id, reuse the cached template profile and slide library, run the research skill, consume a schema-valid handoff, render and QA the deck, and return the final PowerPoint file.

This requires a repo-shipped OpenClaw skill and portable setup docs. Until those exist, Deck Factory is a working local v0, not a drop-in OpenClaw package.
