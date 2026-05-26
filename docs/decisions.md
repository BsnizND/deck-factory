# V0 Architecture Decisions

This file records the first concrete product and architecture decisions for Deck Factory.

## Renderer Strategy

Decision: start with a thin Deck Factory adapter over `pptx-automizer`, using `PptxGenJS` underneath when new dynamic elements are required.

Why:

- Deck Factory is built around bring-your-own PowerPoint templates.
- `pptx-automizer` is designed to manipulate and merge existing `.pptx` files.
- `pptx-automizer` already wraps `PptxGenJS`, so the project can use existing template editing and programmatic generation tools without inventing a renderer.
- A thin adapter lets Deck Factory define its own spec, QA loop, and approval workflow while keeping the renderer swappable later.

Non-goals for v0:

- Do not build a custom PPTX renderer.
- Do not fork renderer internals before exhausting documented package APIs.
- Do not make `agent-slides` the core dependency yet.

Use `agent-slides` as a reference architecture for extraction, validation, CLI ergonomics, and agent workflows. Revisit direct integration after Deck Factory has its own minimal pipeline running.

## Accepted Template Inputs

Decision: v0 should accept user-supplied `.pptx` files as the primary template format.

The template should be a normal PowerPoint deck with representative dummy slides. Users should be able to provide a deck that contains the layouts they expect Deck Factory to reuse: title, section, content, image, comparison, chart, table, quote, and appendix slides.

`.potx` support can come later if the renderer stack handles it cleanly. For v0, users can save a PowerPoint template as `.pptx` and include representative slides.

Deck Factory should also include sample templates so users can see what a good template contains.

## Template And Library Reuse

Decision: registered styles are the unit of reuse.

A style id such as `snizco-agency` resolves to:

- one prepared `.pptx` template deck
- one cached template profile
- zero or more registered slide libraries
- style notes and layout mappings

The planner should never re-extract a registered current template or slide library just because a user asks for another deck in the same style. Re-extraction is allowed only when the source fingerprint, extractor version, profile schema, or explicit refresh command requires it.

Slide libraries are first-class parts of the style. The planner may mix generated slides and library slides in one deck, but the renderer must insert only registered slides by id and must fail closed when required fields are missing.

Planned sample templates:

- `business-review.pptx`: executive update, metrics, risks, next steps
- `strategy-readout.pptx`: narrative sections, evidence slides, recommendation slides
- `sales-proposal.pptx`: problem, solution, proof, pricing, implementation

## First Deck Spec Schema

Decision: keep the v0 schema small, but expressive enough for real decks.

The first schema should include:

- `version`: schema version.
- `deck`: title, audience, objective, tone, requested length, and optional speaker-notes preference.
- `template`: template path, extracted profile path, and optional preferred layouts.
- `assets`: named references to images, charts, tables, source documents, and citations.
- `slides`: ordered slide specs.
- `constraints`: global constraints such as max slide count, required sections, brand restrictions, citation requirements, and approval requirements.

Each slide should include:

- `id`: stable slide identifier.
- `layout`: requested or inferred template layout.
- `purpose`: why the slide exists.
- `title`: visible slide title.
- `action_title`: optional assertion headline.
- `content`: typed blocks such as text, bullets, image, chart, table, quote, callout, divider, and footer.
- `speaker_notes`: optional notes.
- `citations`: source references used on the slide.
- `constraints`: slide-specific requirements such as must-use asset, max bullets, or keep-with-next.

Keep detailed positioning out of the authored deck spec when possible. The renderer adapter should translate semantic blocks into concrete placement using the template profile.

## Template Extraction

Decision: extract what can be known mechanically, then let the agent interpret intended use.

Deterministic extraction should handle:

- slide size and aspect ratio
- masters and layouts
- theme colors
- theme fonts
- placeholder names, types, and bounds
- shape names, bounds, and style metadata
- text style runs from representative dummy slides
- image placeholders and asset-like shapes
- chart and table presence

Agent interpretation should handle:

- naming layout archetypes in human terms
- deciding which dummy slides represent reusable patterns
- identifying content roles when the template is visually clear but semantically under-labeled
- choosing layouts for a new brief
- deciding whether content should be split, shortened, or moved
- reviewing rendered screenshots for visual hierarchy and client-readiness

The deterministic layer creates facts. The agent layer makes design judgments from those facts.

## Mandatory V0 QA

Decision: v0 must have both deterministic checks and a screenshot review loop.

Required deterministic checks:

- render succeeds
- output slide count matches the deck spec
- every slide can be rasterized to PNG
- no known missing image assets
- no detected text overflow or clipping
- no obvious out-of-bounds shapes
- no severe unintended overlaps
- font substitution is reported
- basic contrast issues are reported where text/background colors can be inferred

Required agentic review:

- inspect slide screenshots
- judge whether the deck looks professional and readable
- flag overcrowding, weak hierarchy, awkward layout choices, and brand-template mismatch
- propose a concrete repair plan when slides fail

The v0 loop is:

```text
render PPTX -> rasterize screenshots -> deterministic QA -> screenshot review -> revise spec -> render again
```

## Repair Strategy

Decision: rewrite the deck spec first. Treat slide operations as generated output.

Most repairs should change semantic intent:

- shorten copy
- split a dense slide
- choose a different layout
- swap a visual treatment
- move content into notes
- replace or crop an asset

The renderer adapter should regenerate operations from the revised spec.

Only patch operations directly when the issue is a renderer-specific positioning problem that cannot be represented cleanly in the deck spec. Direct operation patches should be logged as technical fixes.

## Client Approval Artifact

Decision: the client-facing artifact is the deck.

The minimum thing a user should receive is:

- `deck.pptx`

Deck Factory should still keep internal build evidence by default:

- screenshots
- QA report
- operation log
- source deck spec
- repair attempts

Those internal artifacts are for reproducibility, debugging, and agent repair. They should not clutter the user-facing handoff unless the user asks for an approval package or the run fails and evidence is needed to explain why.

## Computer Use Boundary

Decision: Deck Factory must not require Computer Use for its core render and QA path.

Computer Use is a deployment capability for live desktop inspection, not the deck engine. The CLI must be able to run with `--computer-use off`, and that must be the default until a local OpenClaw/Codex Computer Use path is proven healthy.

Modes:

- `off`: no `@Computer`, PowerPoint UI automation, Telegram UI inspection, or desktop control is allowed or required.
- `optional`: the deck pipeline still succeeds or fails without desktop control; an orchestrator may run a separate post-build desktop check.
- `required`: an external desktop verification gate is required by the caller, but the Deck Factory CLI only records that requirement and does not pretend to perform it.

The run writes `capabilities.json` so Jay and other agents can report whether a deck was built with Computer Use disabled, optional, or externally required.

## Public OpenClaw Integration

Decision: Deck Factory is not public-integration complete until it ships an OpenClaw skill and portable setup docs.

The repo can be buildable and still not be ready for arbitrary OpenClaw users. Public integration requires:

- `openclaw/skills/deck-factory/SKILL.md`
- portable defaults that prefer local `openclaw` over Brian-specific hosts
- install and smoke-test instructions
- style-name resolution rules
- explicit Computer Use mode guidance
- deterministic output-path conventions
- a cross-skill handoff walkthrough
- fail-closed blocker language for unknown styles, stale/missing templates, missing slide libraries, missing OpenClaw credentials, and missing rasterizer tools

Brian-specific defaults such as `ssh snizserver openclaw` and agent `jay` are valid local deployment overrides, not public defaults.

## V0 Definition Of Done

V0 is real when Deck Factory can:

1. Accept a user-supplied `.pptx` template with representative dummy slides.
2. Extract a minimal template profile.
3. Render a 3 to 5 slide editable deck using the selected template.
4. Rasterize every output slide.
5. Run deterministic QA.
6. Run a screenshot evaluator loop.
7. Repair at least one common failure by changing the deck spec and rerendering.
8. Deliver `deck.pptx` as the primary artifact.

Public OpenClaw integration is real when a clean clone can install the skill, register a prepared template deck once, and run from a schema-valid upstream handoff to `deck.pptx` without relying on Brian-specific paths, hosts, or agent ids.
