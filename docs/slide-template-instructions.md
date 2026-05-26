# Slide Template Instructions

This feature expands Deck Factory from "fill this PowerPoint layout" into a richer planning contract between an originating agent, a registered template, and the renderer.

The core idea: every template layout should explain what kind of slide it is, when to use it, what each placeholder means, how content should be written for that placeholder, and what visual or narrative constraints apply. A deck spec then becomes more than slide text. It becomes a set of intentional choices about story, layout, voice, content fit, and assets.

## Why This Matters

Current v0 template metadata is mostly structural:

- slide size
- layouts
- theme colors
- fonts
- placeholders
- reusable slide-library entries

That is enough to render a deck, but not enough to teach an agent how a good presentation team would use the template. Real templates carry implicit strategy:

- this layout is for a decisive recommendation
- this placeholder wants a short action title, not a label
- this body area works for three crisp proof points, not a paragraph
- this image well should show the product, customer, or operating context
- this case-study slide works for proof, credibility, or "why us" moments
- this mission-statement slide should be written in plain, specific language

Deck Factory should make those rules explicit and machine-readable.

## Feature Shape

Add a guidance layer to registered templates and slide libraries:

```text
template.pptx
  -> template profile
  -> layout instruction catalog
  -> placeholder writing contracts
  -> deck planner dialogue
  -> deck spec
  -> render and QA
```

The guidance layer should answer four questions for every usable layout:

1. What kind of slide is this?
2. When should an agent choose this slide?
3. What content belongs in each placeholder?
4. What voice, length, asset, and evidence rules apply?

## Layout Instruction Catalog

Each layout should have an instruction record. This can be extracted partly from markers in the PowerPoint file and then enriched by an agent or operator.

Example:

```json
{
  "layoutId": "recommendation-3-proof-points",
  "displayName": "Recommendation With Three Proof Points",
  "slideKind": "recommendation",
  "narrativeRole": "Make a clear recommendation and support it with three reasons.",
  "useWhen": [
    "The deck needs to move from analysis to action.",
    "The audience needs one clear decision or direction.",
    "The evidence can be summarized in three compact proof points."
  ],
  "avoidWhen": [
    "The recommendation is still exploratory.",
    "The proof requires a chart, table, or detailed evidence trail.",
    "The content needs more than three support points."
  ],
  "worksFor": [
    "strategy recommendation",
    "board decision",
    "sales proposal next step",
    "mission statement translation into operating priorities"
  ],
  "contentVoice": "decisive, plain-spoken, evidence-backed",
  "assetGuidance": {
    "imageRole": "optional supporting visual",
    "imageShouldShow": "the product, customer moment, operating environment, or proof artifact",
    "avoid": "generic atmospheric imagery"
  }
}
```

## Placeholder Writing Contracts

Each editable placeholder should describe its content job. The agent should not just know that `df_body` is a text box. It should know that the box expects three concise proof points, each with a claim and implication.

Example:

```json
{
  "placeholderId": "df_action_title",
  "role": "action-title",
  "contentKind": "single-sentence claim",
  "writeAs": "State the slide's takeaway, not the topic.",
  "voice": "direct and specific",
  "maxCharacters": 105,
  "goodExamples": [
    "Prioritize the loyalty app because it compounds frequency and first-party data.",
    "Move the launch plan from awareness to trial by anchoring it in store-level proof."
  ],
  "badExamples": [
    "Recommendation",
    "Loyalty App Overview"
  ],
  "validationHints": [
    "Avoid vague nouns without a verb.",
    "Prefer one concrete action or finding.",
    "Do not end with a colon."
  ]
}
```

For body placeholders:

```json
{
  "placeholderId": "df_proof_points",
  "role": "supporting-proof-list",
  "contentKind": "three bullet points",
  "writeAs": "Each bullet should pair an evidence-backed claim with a business implication.",
  "voice": "consultative, compact, non-hype",
  "minItems": 3,
  "maxItems": 3,
  "maxCharactersPerItem": 120,
  "itemPattern": "Claim: implication",
  "requiresCitations": true
}
```

For image placeholders:

```json
{
  "placeholderId": "df_image",
  "role": "evidence-image",
  "contentKind": "image",
  "imageGuidance": {
    "bestUse": "Show the real product, customer context, location, UI, chart, or artifact being discussed.",
    "avoid": [
      "abstract gradients",
      "generic business stock photography",
      "dark or blurred atmospheric images"
    ],
    "preferredAspectRatio": "16:9",
    "requiresSource": true
  }
}
```

## Planner Dialogue

The originating agent should decide what story it wants to tell. The template should describe what kinds of slides are available. The planner sits between them.

The interaction should look like this:

```text
Originating agent:
  I need a 10-slide market-entry recommendation for an executive audience.

Template guidance:
  Available layouts include cover, section divider, market context, comparison,
  recommendation, proof points, roadmap, case study, quote, appendix.

Planner:
  I will use market context for the problem, comparison for options,
  recommendation for the decision, roadmap for implementation, and appendix
  for source detail. I will avoid the case-study layout because the brief
  does not include a concrete customer story.

Deck spec:
  Ordered slides reference layout ids, placeholder ids, content, assets,
  citations, voice constraints, and any requested deviations.
```

This makes deck creation a two-way dialogue without making the renderer guess. The agent reasons about narrative and layout choice. The template contributes constraints and examples. The CLI validates and renders the resulting spec.

## Spec Impact

The deck spec should eventually reference template guidance directly:

```json
{
  "id": "slide-05",
  "layout": "recommendation-3-proof-points",
  "purpose": "Recommend the highest-leverage launch path.",
  "selectionReason": "The slide needs one decision and three concise reasons.",
  "content": [
    {
      "placeholderId": "df_action_title",
      "value": "Launch with loyalty-led trial because it links demand creation to measurable repeat behavior."
    },
    {
      "placeholderId": "df_proof_points",
      "items": [
        "Frequency: loyalty mechanics give the team a repeat-visit lever after first purchase.",
        "Data: app enrollment creates a first-party signal for offer testing and retention.",
        "Operations: store-level redemption data can show where rollout support is working."
      ]
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
```

This preserves the current spec-first architecture while making the spec more intentional.

## Authoring UX

Template owners should be able to provide guidance in two ways:

- PowerPoint markers: hidden text or Selection Pane names such as `DF_LAYOUT`, `DF_KIND`, `DF_PLACEHOLDER_ROLE`, and `DF_USE_WHEN`.
- Sidecar files: editable JSON or Markdown files that enrich the extracted template profile with examples, voice rules, use cases, and image guidance.

The sidecar approach is important because layout guidance is editorial, not only mechanical. It should be easy for an agency strategist, consultant, or brand lead to improve the template instructions without editing renderer code.

## Example Use Cases

This feature is useful for:

- agency strategy decks where each layout has a known rhetorical job
- sales decks where proof, pricing, case studies, and next steps need different voices
- research readouts where evidence slides and recommendation slides should not sound the same
- board decks where action titles, risks, and decisions must be crisp
- mission, vision, and values decks where copy needs to be specific rather than generic
- product launch decks where image placeholders should show real product, UI, channel, or customer context

## MVP

The smallest useful version should:

- add an optional `layoutInstructions` block to template or slide-library metadata
- add placeholder-level writing contracts for title, subtitle, body, chart, table, image, and footer roles
- expose those instructions to the OpenClaw planner before it produces `deck-spec.json`
- require the planner to include `selectionReason` for each chosen layout
- validate placeholder ids against the selected layout
- fail closed when required placeholder content or required assets are missing

The renderer does not need to become smarter first. The planner and schema should become better at expressing what should be rendered.

## Later Extensions

Later versions can add:

- an agent-assisted template instruction authoring workflow
- automatic critique of vague layout guidance
- screenshot examples for each layout in the instruction catalog
- per-layout few-shot examples of good and bad slide specs
- audience-specific voice variants
- brand-specific banned phrases and preferred vocabulary
- layout selection analytics from successful decks
- repair prompts that cite the exact placeholder writing contract that was violated

## Open Question

The main product decision is whether this belongs inside `template-profile.json`, `slide-library.json`, or a new sidecar artifact such as `template-instructions.json`.

The likely answer is a sidecar artifact linked from the registry. The extracted profile should remain factual and machine-generated. The instruction catalog should be editable, reviewable, and versioned as human-plus-agent guidance.
