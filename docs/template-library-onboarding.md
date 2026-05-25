# Template And Slide Library Onboarding

Deck Factory works best when styles are registered once and reused by name.

## Prepare A Template Deck

Use a normal `.pptx` file, not a blank `.potx`, for v0.

The deck should contain representative dummy slides for every layout the agent should use. At minimum include:

- title or cover
- content/body
- any common analytical patterns, such as two-column, chart, table, comparison, quote, or appendix

Each reusable pattern slide should include:

- a visible or hidden marker such as `DF_LAYOUT: title` or `DF_LAYOUT: content`
- real PowerPoint text, shapes, tables, charts, and image boxes
- stable Selection Pane names for editable objects, such as `df_title`, `df_subtitle`, `df_body`, `df_footer`, `df_chart`, and `df_table`
- realistic dummy text length so QA can catch layouts that are too tight
- actual brand fonts, colors, logos, and footer/header treatments

Avoid template slides that are one flattened screenshot. Deck Factory needs editable PowerPoint objects.

## Register The Template

```bash
npm run cli -- templates register \
  --id <style-id> \
  --name "<display name>" \
  --template-deck <path-to-template.pptx>
```

Example:

```bash
npm run cli -- templates register \
  --id snizco-agency \
  --name "Snizco Agency" \
  --template-deck samples/snizco-agency/template.pptx
```

Inspect the result:

```bash
npm run cli -- templates inspect snizco-agency
```

Deck Factory writes a prep report under `registry/reports/`. If the template is not ready, fix the PowerPoint file and register again.

## Prepare A Slide Library

A slide library is optional but important for agency styles. It stores reusable slides such as:

- about-us
- methodology
- credentials
- case-study
- legal-disclaimer
- appendix/source notes

Use a normal `.pptx` file. Mark each reusable slide with:

```text
DF_LIBRARY: about-us
DF_KIND: full-built
```

Supported kinds:

- `full-built`: inserted mostly unchanged
- `parameterized`: inserted with required `{{field}}` replacements
- `pattern`: reusable structure for generated content
- `appendix`: reusable appendix or source material

For parameterized slides, add fields such as:

```text
{{client}}
{{challenge}}
{{solution}}
{{result}}
```

Deck Factory fails closed if a selected parameterized slide is missing a required field.

## Register The Slide Library

```bash
npm run cli -- libraries register \
  --style <style-id> \
  --library-deck <path-to-library.pptx>
```

Example:

```bash
npm run cli -- libraries register \
  --style snizco-agency \
  --library-deck samples/snizco-agency/library.pptx
```

Inspect the library:

```bash
npm run cli -- libraries list --style snizco-agency
npm run cli -- libraries inspect --style snizco-agency about-us
```

## Reuse And Refresh

Deck Factory fingerprints template decks and slide libraries. Re-registering unchanged sources reuses cached metadata. Re-extraction happens only when:

- the source `.pptx` file changes
- the extractor version changes
- the schema version changes
- the operator explicitly asks for refresh

Use this when a source template changes:

```bash
npm run cli -- templates refresh <style-id>
```

Unknown styles fail with a template-registration request instead of silently substituting another style.
