#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const withOpenClaw = args.has("--with-openclaw");
const root = process.cwd();

run("npm", ["run", "build"]);
run("npm", ["run", "check"]);
run("npm", ["test"]);
run("npm", ["run", "check:skill"]);

const registryBefore = readJson("registry/templates.json");
const libraryBefore = readJson("registry/slide-libraries/snizco-agency.json");

run("npm", [
  "run",
  "cli",
  "--",
  "templates",
  "register",
  "--id",
  "snizco-agency",
  "--name",
  "Snizco Agency",
  "--template-deck",
  "samples/snizco-agency/template.pptx"
]);
run("npm", [
  "run",
  "cli",
  "--",
  "libraries",
  "register",
  "--style",
  "snizco-agency",
  "--library-deck",
  "samples/snizco-agency/library.pptx"
]);

const registryAfter = readJson("registry/templates.json");
const libraryAfter = readJson("registry/slide-libraries/snizco-agency.json");
assert(
  JSON.stringify(registryBefore) === JSON.stringify(registryAfter),
  "Template registration changed registry metadata; expected cached profile reuse."
);
assert(
  JSON.stringify(libraryBefore) === JSON.stringify(libraryAfter),
  "Slide library registration changed library metadata; expected cached library reuse."
);

run("npm", [
  "run",
  "cli",
  "--",
  "build",
  "--spec",
  "samples/snizco-agency/deck-spec.json",
  "--out",
  "artifacts/public-smoke-build"
]);
run("npm", [
  "run",
  "cli",
  "--",
  "qa",
  "--deck",
  "artifacts/public-smoke-build/deck.pptx",
  "--spec",
  "samples/snizco-agency/deck-spec.json",
  "--out",
  "artifacts/public-smoke-build"
]);
assert(existsSync(path.join(root, "artifacts/public-smoke-build/deck.pptx")), "Deterministic smoke did not produce deck.pptx.");

const doctorStatus = runMaybe("npm", ["run", "cli", "--", "doctor", "--json"]);
if (withOpenClaw && doctorStatus !== 0) {
  process.exit(doctorStatus);
}
if (!withOpenClaw && doctorStatus !== 0) {
  console.error("Doctor reported an OpenClaw setup blocker. That is allowed for the no-OpenClaw public smoke; rerun with --with-openclaw after configuring a worker agent.");
}

if (withOpenClaw) {
  run("npm", [
    "run",
    "cli",
    "--",
    "run",
    "--style",
    "Snizco Agency",
    "--handoff",
    "samples/5c-research/chick-fil-a-handoff.json",
    "--computer-use",
    "off",
    "--max-repair-attempts",
    "0"
  ]);
  assert(
    existsSync(path.join(root, "artifacts/chick-fil-a-5c-research-report-snizco-agency/deck.pptx")),
    "OpenClaw smoke did not produce the deterministic handoff deck."
  );
}

console.log(`Deck Factory public smoke passed${withOpenClaw ? " with OpenClaw handoff run" : " without OpenClaw handoff run"}.`);

function run(command, commandArgs) {
  execFileSync(command, commandArgs, { stdio: "inherit", cwd: root, env: process.env });
}

function runMaybe(command, commandArgs) {
  try {
    run(command, commandArgs);
    return 0;
  } catch (error) {
    const status = typeof error.status === "number" ? error.status : 1;
    console.error(`Command failed with status ${status}: ${command} ${commandArgs.join(" ")}`);
    return status;
  }
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}
