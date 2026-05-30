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
  "## Optional Artifact Publishing",
  "## Blockers",
  "## Final Response Contract",
  "## Final Response Contract With Publishing",
  "npm run cli -- run",
  "--computer-use off",
  "--publish tailnet-gateway",
  "publish-result.json",
  "Do not publish failed or QA-blocked decks",
  "artifacts/<subject-slug>-<report-type-slug>-<style-id>/deck.pptx",
  "Do not re-extract a registered current template or slide library on every run",
  "Do not create or require a new OpenClaw worker agent",
  "approved existing execution lane"
];

const forbiddenPublicDefaults = [
  "snizserver",
  "ssh snizserver",
  "agent jay",
  "--agent jay",
  "Tailscale Funnel is default",
  "publishing is required by default"
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
if (/\/Users\//.test(skill)) {
  failures.push("forbidden user-specific path in skill: /Users/");
}
if (/[a-z0-9-]+\.[a-z0-9-]+\.ts\.net/i.test(skill)) {
  failures.push("forbidden hardcoded private Tailscale hostname in skill");
}

if (failures.length > 0) {
  console.error(["Deck Factory skill static check failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
  process.exit(1);
}

console.log("Deck Factory skill static check passed.");
