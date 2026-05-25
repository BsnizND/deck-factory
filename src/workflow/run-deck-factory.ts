import path from "node:path";
import { buildDeck } from "./build-deck.js";
import { runOpenClawJsonWorker } from "../ai/openclaw-json-worker.js";
import { fail } from "../errors.js";
import { inspectTemplate } from "../registry/template-registry.js";
import { loadSlideLibrary } from "../registry/slide-library.js";
import { loadStylePack } from "../registry/style-pack.js";
import { validateSchema } from "../schema/validate.js";
import type { TemplateProfile } from "../template/extract-template-profile.js";
import { readJsonFile, resolveFromCwd, writeJsonFile } from "../util/fs.js";
import { qaDeck } from "../qa/qa-deck.js";

interface DeckSpec {
  style: { styleId?: string };
  openclaw: {
    reviewerAgent: string;
    maxRepairAttempts: number;
  };
}

interface SkillDeckHandoff {
  preferredStyleId: string;
}

export interface RunDeckFactoryResult {
  runDir: string;
  specPath: string;
  deckPath: string;
  operationsPath: string;
  qaReportPath: string;
}

export async function runDeckFactory(options: {
  styleId: string;
  outDir: string;
  handoffPath?: string;
  specPath?: string;
  plannerAgent?: string;
  maxRepairAttempts?: number;
}): Promise<RunDeckFactoryResult> {
  if (!options.handoffPath && !options.specPath) {
    fail("Provide either --handoff for OpenClaw planning or --spec for an already approved deck spec.");
  }
  if (options.handoffPath && options.specPath) {
    fail("Provide only one input: --handoff or --spec.");
  }

  const runDir = resolveFromCwd(options.outDir);
  const specPath = options.specPath
    ? await prepareProvidedSpec(options.specPath, options.styleId, runDir)
    : await planSpecWithOpenClaw({
        handoffPath: options.handoffPath!,
        styleId: options.styleId,
        runDir,
        plannerAgent: options.plannerAgent
      });

  let currentSpecPath = specPath;
  let build = await buildDeck({ specPath: currentSpecPath, outDir: runDir });
  let qa = await qaDeck({ deckPath: build.deckPath, specPath: currentSpecPath, outDir: runDir, failOnError: false });
  const initialSpec = await readJsonFile<DeckSpec>(currentSpecPath);
  const maxRepairAttempts = options.maxRepairAttempts ?? initialSpec.openclaw.maxRepairAttempts;

  for (let attempt = 1; qa.report.status !== "passed" && attempt <= maxRepairAttempts; attempt += 1) {
    if (!isRepairableQaFailure(qa.report)) {
      fail(`Deck QA failed with non-repairable prerequisite or render errors. See report: ${qa.reportPath}`);
    }
    currentSpecPath = await repairSpecWithOpenClaw({
      specPath: currentSpecPath,
      qaReportPath: qa.reportPath,
      runDir,
      attempt
    });
    build = await buildDeck({ specPath: currentSpecPath, outDir: runDir });
    qa = await qaDeck({ deckPath: build.deckPath, specPath: currentSpecPath, outDir: runDir, failOnError: false });
  }

  if (qa.report.status !== "passed") {
    fail(`Deck QA failed after ${maxRepairAttempts} repair attempt(s). See report: ${qa.reportPath}`);
  }
  return {
    runDir,
    specPath: currentSpecPath,
    deckPath: build.deckPath,
    operationsPath: build.operationsPath,
    qaReportPath: qa.reportPath
  };
}

async function prepareProvidedSpec(specPathInput: string, styleId: string, runDir: string): Promise<string> {
  const sourceSpecPath = resolveFromCwd(specPathInput);
  const spec = await readJsonFile<DeckSpec>(sourceSpecPath);
  await validateSchema("deck-spec", spec);
  if (spec.style.styleId !== styleId) {
    fail(`Deck spec style ${spec.style.styleId ?? "(missing)"} does not match requested style ${styleId}.`);
  }
  const runSpecPath = path.join(runDir, "deck-spec.json");
  await writeJsonFile(runSpecPath, spec);
  return runSpecPath;
}

async function planSpecWithOpenClaw(options: {
  handoffPath: string;
  styleId: string;
  runDir: string;
  plannerAgent?: string;
}): Promise<string> {
  const handoff = await readJsonFile<SkillDeckHandoff>(resolveFromCwd(options.handoffPath));
  await validateSchema("skill-deck-handoff", handoff);
  if (handoff.preferredStyleId && handoff.preferredStyleId !== options.styleId) {
    fail(`Handoff requested style ${handoff.preferredStyleId}, but run requested ${options.styleId}.`);
  }

  const style = await loadStylePack(options.styleId);
  const template = await inspectTemplate(style.templateId);
  const templateProfile = await readJsonFile<TemplateProfile>(resolveFromCwd(template.cachedProfilePath));
  const slideLibraries = await Promise.all(style.slideLibraries.map((libraryId) => loadSlideLibrary(libraryId)));
  const plannerAgent = options.plannerAgent ?? "jay";

  const plannerRunDir = path.join(options.runDir, "openclaw-planner");
  const result = await runOpenClawJsonWorker<unknown>({
    lane: "deck-factory-planner",
    agent: plannerAgent,
    schemaName: "deck-spec",
    runDir: plannerRunDir,
    context: {
      version: "deck-factory.planner-context.v1",
      handoff,
      requestedStyleId: options.styleId,
      style,
      template,
      templateProfile,
      slideLibraries
    },
    prompt: [
      "Turn the skill handoff into a Deck Factory deck-spec.",
      "Use the requested style exactly.",
      "Prefer registered library slides when they directly satisfy requestedLibrarySlides or standard evergreen material.",
      "Use generated slides for the analytical body.",
      "Do not invent citations or evidence. Preserve source evidence from the handoff.",
      "Return only the deck-spec JSON object."
    ].join("\n")
  });

  const runSpecPath = path.join(options.runDir, "deck-spec.json");
  await writeJsonFile(runSpecPath, result.output);
  return runSpecPath;
}

async function repairSpecWithOpenClaw(options: {
  specPath: string;
  qaReportPath: string;
  runDir: string;
  attempt: number;
}): Promise<string> {
  const spec = await readJsonFile<DeckSpec>(options.specPath);
  await validateSchema("deck-spec", spec);
  const qaReport = await readJsonFile<unknown>(options.qaReportPath);
  await validateSchema("qa-report", qaReport);
  const repairRunDir = path.join(options.runDir, "repairs", `attempt-${options.attempt}`);
  const result = await runOpenClawJsonWorker<unknown>({
    lane: "deck-factory-repair",
    agent: spec.openclaw.reviewerAgent,
    schemaName: "deck-spec",
    runDir: repairRunDir,
    context: {
      version: "deck-factory.repair-context.v1",
      attempt: options.attempt,
      deckSpec: spec,
      qaReport
    },
    prompt: [
      "Repair the Deck Factory deck-spec based on the QA report.",
      "Return a complete replacement deck-spec JSON object.",
      "Keep the same style id and factual evidence.",
      "Prefer smaller text, simpler layouts, fewer bullets, or alternate registered layouts over inventing new content.",
      "Do not claim that missing tools or renderer prerequisites are fixed by editing the spec."
    ].join("\n")
  });
  const repairedSpecPath = path.join(repairRunDir, "deck-spec.json");
  await writeJsonFile(repairedSpecPath, result.output);
  return repairedSpecPath;
}

function isRepairableQaFailure(report: { renderStatus: string; screenshotEvaluatorNotes: unknown[] }): boolean {
  if (report.renderStatus !== "passed") {
    return false;
  }
  return !report.screenshotEvaluatorNotes.some((note) => {
    const record = note as Record<string, unknown>;
    return record.type === "missing-prerequisite";
  });
}
