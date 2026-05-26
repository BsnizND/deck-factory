#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const skillPath = path.join(root, "openclaw/skills/deck-factory/SKILL.md");
const skill = readFileSync(skillPath, "utf8");

const requiredPhrases = [
  "## When To Use",
  "## Non-Goals",
  "## Required Inputs",
  "## Style Resolution",
  "## First-Time Registration",
  "## Running A Deck",
  "## Computer Use Mode",
  "## QA Gates",
  "## Blockers",
  "## Final Response Contract",
  "npm run cli -- run",
  "--computer-use off",
  "artifacts/<subject-slug>-<report-type-slug>-<style-id>/deck.pptx",
  "Do not re-extract a registered current template or slide library on every run"
];

const forbiddenPublicDefaults = [
  "snizserver",
  "ssh snizserver",
  "agent jay",
  "--agent jay"
];

const failures = [];
for (const phrase of requiredPhrases) {
  if (!skill.includes(phrase)) {
    failures.push(`missing required phrase: ${phrase}`);
  }
}
for (const phrase of forbiddenPublicDefaults) {
  if (skill.toLowerCase().includes(phrase.toLowerCase())) {
    failures.push(`forbidden public default in skill: ${phrase}`);
  }
}

if (failures.length > 0) {
  console.error(["Deck Factory skill static check failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
  process.exit(1);
}

console.log("Deck Factory skill static check passed.");
