# Chick-fil-A 5C Request Example

User request:

```text
Do a 5C research report on Chick-fil-A in a deck in Snizco Agency style.
```

Expected flow:

1. Run or request the upstream 5C research skill.
2. Require the upstream skill to emit a schema-valid `skill-deck-handoff.json`.
3. Resolve `Snizco Agency` through Deck Factory style registration.
4. Reuse the cached template profile and slide library when current.
5. Run Deck Factory:

```bash
npm run cli -- run \
  --style "Snizco Agency" \
  --handoff samples/5c-research/chick-fil-a-handoff.json \
  --computer-use off
```

Default output:

```text
artifacts/chick-fil-a-5c-research-report-snizco-agency/deck.pptx
```

Return the deck path after QA passes. Include `qa-report.json` and screenshots only if the user asks or the run fails.
