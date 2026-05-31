# Artifact Retention And Package Manifest

Deck Factory writes one `package-manifest.json` in every successful run directory. The manifest is the operator-facing boundary between the client deliverable and the evidence needed to prove the run.

## Default Handoff

The default client handoff is deck-only:

```text
<out>/deck.pptx
```

Internal evidence is not included in the default handoff. Send it only when the user asks for an approval package, audit bundle, or failure explanation.

## Manifest Contract

`package-manifest.json` records:

- the final deck as `primary-deck` and `client-deliverable`
- `publish-result.json`, when present, as `delivery-metadata`
- QA, provenance, source map, product-quality, template, PowerPoint file-role, capability, screenshot, and operations artifacts as internal evidence or logs
- retention guidance for final decks, approval evidence, published delivery links, and smoke runs
- delivery visibility and expiration metadata without duplicating the tokenized download URL

Do not copy tokenized Tailnet Artifact Gateway URLs into the manifest, approval evidence, or chat transcripts. Use `publish-result.json` as the single delivery-control artifact.

## Retention Rules

- Final decks are retained as the project deliverable.
- Approval evidence remains with the run until operator cleanup or project archive.
- Tailnet Artifact Gateway delivery links expire by the configured TTL and must stay behind the tailnet.
- Smoke-test packages should use a one-hour-or-shorter TTL and can be purged after proof is captured.
- Internal evidence is preserved for QA, debugging, and audit, but it is not client-facing by default.

## Operational Proof

A production run is not complete until `run-summary.json` references `package-manifest.json` and the manifest validates against `schemas/package-manifest.schema.json`.
