# Client Delivery Review - 2026-05-31

Reviewed run:

- Artifact directory: `/Volumes/LaCie_6big/briansnyder/repos/deck-factory/artifacts/chick-fil-a-5c-publish-smoke`
- Deck: `deck.pptx`
- Run summary: `run-summary.json`
- QA report: `qa-report.json`
- Source map: `source-map.json`
- Screenshots: `screenshots/slide-001.png` through `screenshots/slide-006.png`
- Published-artifact evidence: `publish-result.json`

## Result

Product acceptance failed.

The run is acceptable as an integration smoke: the deck rendered, deterministic
QA passed, screenshot review passed, template compliance passed, evidence
artifacts were emitted, and private Tailnet Artifact Gateway publishing was
proven after QA.

The deck is not acceptable as a client-delivery package. It is a six-slide
sample fixture with no citations, no external source sections, no charts or
tables, no client-ready narrative arc, no speaker notes, and repeated visible
warnings that the content is sample-only rather than decision-grade research.

## Evidence Observed

- `run-summary.json` reported `status: passed`.
- `deck-spec.json` contained six slides.
- `source-map.json` showed zero citations for every slide and no source
  sections.
- `powerpoint-files.json` accepted the generated `.pptx` output.
- `qa-report.json` passed deterministic/render QA, but included a minor
  `contact-sheet-failed` finding even though `screenshots/contact-sheet.png`
  exists.
- `template-instructions` in the run summary was skipped because no template
  instructions were configured for the style.
- All six slides had `speakerNotes` absent.
- Slide 1 labeled the work as a sample fixture, not live research.
- Slide 4 stated that no citations, external evidence, charts, tables, or asset
  references were supplied.
- Slide 5 used sample company/customer context and explicitly said there was no
  customer evidence or citations in the handoff.
- Slide 6 recommended adding live research evidence, citations, charts, and
  tables before treating the deck as decision-grade.

## Acceptance Gap

Deck Factory needs a product-quality gate distinct from deterministic QA. A
technically valid deck can still fail if it is too shallow, visibly fixture-like,
or not useful for the intended audience.

Client-delivery acceptance requires:

- a real brief or approved research handoff, not sample fixture content;
- an executive story arc with a clear recommendation, not a thin inventory of
  supplied fields;
- cited source lineage for material factual claims;
- editable charts, tables, or structured exhibits where the brief calls for
  evidence;
- speaker notes policy satisfied, either notes present or explicitly waived;
- no visible "sample fixture" or "not live research" caveats in a final client
  package;
- a package manifest that separates the final deck from internal evidence;
- a human/product review result recorded as `passed` before calling the deck
  presentation-ready.

Until that gate exists and passes on a real client-style run, Deck Factory
should be described as technically integrated but not product-accepted.
