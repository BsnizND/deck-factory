import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  computerUsePromptInstruction,
  describeComputerUseCapability,
  resolveComputerUseMode,
  type ComputerUseCapability,
  type ComputerUseMode
} from "../capabilities/computer-use.js";
import { buildDeck } from "./build-deck.js";
import { runOpenClawJsonWorker } from "../ai/openclaw-json-worker.js";
import { fail } from "../errors.js";
import { DEFAULT_OPENCLAW_AGENT, resolveOpenClawCommand, resolveSimpleSshTarget } from "../openclaw/command.js";
import { assertPowerPointFileRole, type PowerPointFileRoleRecord } from "../powerpoint/file-roles.js";
import { inspectTemplate } from "../registry/template-registry.js";
import { loadSlideLibrary } from "../registry/slide-library.js";
import { resolveStylePack } from "../registry/style-pack.js";
import { validateSchema } from "../schema/validate.js";
import type { TemplateProfile } from "../template/extract-template-profile.js";
import { readJsonFile, resolveFromCwd, writeJsonFile } from "../util/fs.js";
import { qaDeck } from "../qa/qa-deck.js";

const execFileAsync = promisify(execFile);

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
  capabilitiesPath: string;
}

interface RunPowerPointManifest {
  version: string;
  inputs: Array<Pick<PowerPointFileRoleRecord, "role" | "portablePath" | "extension" | "status">>;
  output: Pick<PowerPointFileRoleRecord, "role" | "portablePath" | "extension" | "status">;
}

interface RunCapabilitiesManifest {
  version: "deck-factory.capabilities.v1";
  computerUse: ComputerUseCapability;
}

export async function runDeckFactory(options: {
  styleId: string;
  outDir: string;
  handoffPath?: string;
  specPath?: string;
  referenceDeckPath?: string;
  plannerAgent?: string;
  maxRepairAttempts?: number;
  openclawCommand?: string;
  computerUseMode?: string;
}): Promise<RunDeckFactoryResult> {
  if (!options.handoffPath && !options.specPath) {
    fail("Provide either --handoff for OpenClaw planning or --spec for an already approved deck spec.");
  }
  if (options.handoffPath && options.specPath) {
    fail("Provide only one input: --handoff or --spec.");
  }

  const runDir = resolveFromCwd(options.outDir);
  const computerUseMode = resolveComputerUseMode(options.computerUseMode);
  const capabilitiesPath = await writeCapabilitiesManifest(runDir, computerUseMode);
  const referenceDeck = options.referenceDeckPath
    ? await assertPowerPointFileRole(options.referenceDeckPath, "reference-deck")
    : null;
  await writePowerPointManifest({
    runDir,
    inputs: referenceDeck ? [referenceDeck] : [],
    outputPath: path.join(runDir, "deck.pptx")
  });
  const specPath = options.specPath
    ? await prepareProvidedSpec(options.specPath, options.styleId, runDir)
    : await planSpecWithOpenClaw({
        handoffPath: options.handoffPath!,
        styleId: options.styleId,
        runDir,
        referenceDeck,
        plannerAgent: options.plannerAgent,
        openclawCommand: options.openclawCommand,
        computerUseMode
      });

  let currentSpecPath = specPath;
  let build = await buildDeck({ specPath: currentSpecPath, outDir: runDir });
  let qa = await qaDeck({ deckPath: build.deckPath, specPath: currentSpecPath, outDir: runDir, failOnError: false });
  if (qa.report.status === "passed") {
    qa = await reviewScreenshotsWithOpenClaw({
      specPath: currentSpecPath,
      qaReportPath: qa.reportPath,
      screenshotsDir: qa.screenshotsDir,
      runDir,
      openclawCommand: options.openclawCommand,
      computerUseMode
    });
  }
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
      openclawCommand: options.openclawCommand,
      computerUseMode,
      attempt
    });
    build = await buildDeck({ specPath: currentSpecPath, outDir: runDir });
    qa = await qaDeck({ deckPath: build.deckPath, specPath: currentSpecPath, outDir: runDir, failOnError: false });
    if (qa.report.status === "passed") {
      qa = await reviewScreenshotsWithOpenClaw({
        specPath: currentSpecPath,
        qaReportPath: qa.reportPath,
        screenshotsDir: qa.screenshotsDir,
        runDir,
        openclawCommand: options.openclawCommand,
        computerUseMode
      });
    }
  }

  if (qa.report.status !== "passed") {
    fail(`Deck QA failed after ${maxRepairAttempts} repair attempt(s). See report: ${qa.reportPath}`);
  }
  return {
    runDir,
    specPath: currentSpecPath,
    deckPath: build.deckPath,
    operationsPath: build.operationsPath,
    qaReportPath: qa.reportPath,
    capabilitiesPath
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
  referenceDeck: PowerPointFileRoleRecord | null;
  plannerAgent?: string;
  openclawCommand?: string;
  computerUseMode: ComputerUseMode;
}): Promise<string> {
  const handoff = await readJsonFile<SkillDeckHandoff>(resolveFromCwd(options.handoffPath));
  await validateSchema("skill-deck-handoff", handoff);
  if (handoff.preferredStyleId && handoff.preferredStyleId !== options.styleId) {
    fail(`Handoff requested style ${handoff.preferredStyleId}, but run requested ${options.styleId}.`);
  }

  const style = await resolveStylePack(options.styleId);
  const template = await inspectTemplate(style.templateId);
  const templateProfile = await readJsonFile<TemplateProfile>(resolveFromCwd(template.cachedProfilePath));
  const slideLibraries = await Promise.all(style.slideLibraries.map((libraryId) => loadSlideLibrary(libraryId)));
  const plannerAgent = options.plannerAgent ?? DEFAULT_OPENCLAW_AGENT;

  const plannerRunDir = path.join(options.runDir, "openclaw-planner");
  const result = await runOpenClawJsonWorker<unknown>({
    lane: "deck-factory-planner",
    agent: plannerAgent,
    schemaName: "deck-spec",
    runDir: plannerRunDir,
    openclawCommand: options.openclawCommand,
    context: {
      version: "deck-factory.planner-context.v1",
      handoff,
      requestedStyleId: options.styleId,
      style,
      template,
      templateProfile,
      slideLibraries,
      referenceDeck: options.referenceDeck,
      capabilities: {
        computerUse: describeComputerUseCapability(options.computerUseMode)
      }
    },
    prompt: [
      "Turn the skill handoff into a Deck Factory deck-spec.",
      computerUsePromptInstruction(options.computerUseMode),
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

async function writePowerPointManifest(options: {
  runDir: string;
  inputs: PowerPointFileRoleRecord[];
  outputPath: string;
}): Promise<void> {
  const output = await assertPowerPointFileRole(options.outputPath, "generated-output");
  const manifest: RunPowerPointManifest = {
    version: "deck-factory.powerpoint-file-roles.v1",
    inputs: options.inputs.map(({ role, portablePath, extension, status }) => ({ role, portablePath, extension, status })),
    output: {
      role: output.role,
      portablePath: output.portablePath,
      extension: output.extension,
      status: output.status
    }
  };
  await writeJsonFile(path.join(options.runDir, "powerpoint-files.json"), manifest);
}

async function writeCapabilitiesManifest(runDir: string, computerUseMode: ComputerUseMode): Promise<string> {
  const capabilitiesPath = path.join(runDir, "capabilities.json");
  const manifest: RunCapabilitiesManifest = {
    version: "deck-factory.capabilities.v1",
    computerUse: describeComputerUseCapability(computerUseMode)
  };
  await writeJsonFile(capabilitiesPath, manifest);
  return capabilitiesPath;
}

async function repairSpecWithOpenClaw(options: {
  specPath: string;
  qaReportPath: string;
  runDir: string;
  openclawCommand?: string;
  computerUseMode: ComputerUseMode;
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
    openclawCommand: options.openclawCommand,
    context: {
      version: "deck-factory.repair-context.v1",
      attempt: options.attempt,
      deckSpec: spec,
      qaReport,
      capabilities: {
        computerUse: describeComputerUseCapability(options.computerUseMode)
      }
    },
    prompt: [
      "Repair the Deck Factory deck-spec based on the QA report.",
      computerUsePromptInstruction(options.computerUseMode),
      "Return a complete replacement deck-spec JSON object.",
      "Keep the same style id and factual evidence.",
      "Prefer smaller text, simpler layouts, fewer bullets, or alternate registered layouts over inventing new content.",
      "If QA reports text-length-overflow, keep generated slide body text at or under the reported maxCharacters value.",
      "If QA reports long-bullet-overflow, rewrite each bullet to stay under the reported maxCharacters value.",
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

async function reviewScreenshotsWithOpenClaw(options: {
  specPath: string;
  qaReportPath: string;
  screenshotsDir: string;
  runDir: string;
  openclawCommand?: string;
  computerUseMode: ComputerUseMode;
}): Promise<Awaited<ReturnType<typeof qaDeck>>> {
  const spec = await readJsonFile<DeckSpec>(options.specPath);
  await validateSchema("deck-spec", spec);
  const qaReport = await readJsonFile<unknown>(options.qaReportPath);
  await validateSchema("qa-report", qaReport);
  const reviewRunDir = path.join(options.runDir, "openclaw-screenshot-review");
  const mirroredScreenshotsDir = await mirrorScreenshotsForOpenClaw({
    screenshotsDir: options.screenshotsDir,
    runDir: options.runDir,
    openclawCommand: options.openclawCommand
  });
  const screenshotFiles = (await readdir(options.screenshotsDir))
    .filter((fileName) => /^slide-\d+\.png$/.test(fileName))
    .sort()
    .map((fileName) => path.join(options.screenshotsDir, fileName));
  if (screenshotFiles.length === 0) {
    fail(`No screenshots were available for OpenClaw review: ${options.screenshotsDir}`);
  }
  const result = await runOpenClawJsonWorker<unknown>({
    lane: "deck-factory-screenshot-review",
    agent: spec.openclaw.reviewerAgent,
    schemaName: "qa-report",
    runDir: reviewRunDir,
    openclawCommand: options.openclawCommand,
    filePaths: screenshotFiles,
    context: {
      version: "deck-factory.screenshot-review-context.v1",
      deckSpec: spec,
      deterministicQaReport: qaReport,
      screenshotsDir: mirroredScreenshotsDir ?? options.screenshotsDir,
      localScreenshotsDir: options.screenshotsDir,
      capabilities: {
        computerUse: describeComputerUseCapability(options.computerUseMode)
      },
      screenshotAccess: mirroredScreenshotsDir
        ? "screenshotsDir has been mirrored to the OpenClaw host"
        : "screenshotsDir is local to the Deck Factory process"
    },
    prompt: [
      "Review the rendered deck screenshots for visual quality.",
      computerUsePromptInstruction(options.computerUseMode),
      "The slide screenshots are attached as image files when the OpenClaw model runtime supports file inputs.",
      "Inspect the screenshot files in screenshotsDir if your runtime can access local files.",
      "Return a complete qa-report JSON object.",
      "Preserve deterministic failure findings from deterministicQaReport.",
      "Set status to failed if the screenshots show unreadable text, severe crowding, obvious rendering corruption, or brand-template mismatch.",
      "If you cannot inspect screenshots from the provided local paths, fail closed with a screenshotEvaluatorNotes entry explaining that screenshot review could not be performed."
    ].join("\n")
  });
  const reviewedReportPath = path.join(options.runDir, "qa-report.json");
  await writeJsonFile(reviewedReportPath, result.output);
  const report = await readJsonFile<Awaited<ReturnType<typeof qaDeck>>["report"]>(reviewedReportPath);
  await validateSchema("qa-report", report);
  return {
    reportPath: reviewedReportPath,
    report,
    screenshotsDir: options.screenshotsDir
  };
}

async function mirrorScreenshotsForOpenClaw(options: {
  screenshotsDir: string;
  runDir: string;
  openclawCommand?: string;
}): Promise<string | null> {
  const openclaw = resolveOpenClawCommand(options.openclawCommand);
  const sshTarget = resolveSimpleSshTarget(openclaw);
  if (!sshTarget) {
    return null;
  }
  const screenshots = (await readdir(options.screenshotsDir))
    .filter((fileName) => /^slide-\d+\.png$/.test(fileName))
    .sort()
    .map((fileName) => path.join(options.screenshotsDir, fileName));
  if (screenshots.length === 0) {
    fail(`No screenshots were available to mirror for OpenClaw review: ${options.screenshotsDir}`);
  }
  const remoteDir = `/tmp/deck-factory/${path.basename(options.runDir)}-${Date.now()}/screenshots`;
  await execFileAsync("ssh", [sshTarget.host, "mkdir", "-p", remoteDir], { timeout: 30_000 });
  await execFileAsync("scp", [...screenshots, `${sshTarget.host}:${remoteDir}/`], {
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024
  });
  return remoteDir;
}
