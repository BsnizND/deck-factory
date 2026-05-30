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
import {
  publishDeckArtifact,
  resolveArtifactPublishOptions,
  shouldPublishAfterQa,
  type ArtifactPublishOptions,
  type ArtifactPublishResult
} from "../publishers/index.js";
import { assertPowerPointFileRole, type PowerPointFileRoleRecord } from "../powerpoint/file-roles.js";
import { scanTemplateSecurity } from "../powerpoint/template-security.js";
import { writeRuntimeProvenance } from "../reports/runtime-provenance.js";
import { createRunSummary, setGate, writeRunSummary } from "../reports/run-summary.js";
import { writeSourceMap } from "../reports/source-map.js";
import { inspectTemplate } from "../registry/template-registry.js";
import { loadSlideLibrary } from "../registry/slide-library.js";
import { resolveStylePack } from "../registry/style-pack.js";
import { validateSchema } from "../schema/validate.js";
import { validateDeckSpecTemplateCompliance } from "../template/template-compliance.js";
import { loadTemplateInstructions } from "../template/template-instructions.js";
import type { TemplateProfile } from "../template/extract-template-profile.js";
import { readJsonFile, resolveFromCwd, writeJsonFile } from "../util/fs.js";
import { qaDeck } from "../qa/qa-deck.js";

const execFileAsync = promisify(execFile);

interface DeckSpec {
  style: { styleId?: string };
  slides?: Array<{
    source?: string;
    layout?: string;
    layoutId?: string;
  }>;
  openclaw: {
    plannerAgent?: string;
    reviewerAgent: string;
    polisherAgent?: string;
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
  publishResultPath?: string;
  publishResult?: ArtifactPublishResult;
  publishWarning?: string;
  runSummaryPath: string;
  templateComplianceReportPath: string;
  templateSecurityReportPath: string;
  runtimeProvenancePath: string;
  sourceMapPath: string;
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
  publish?: string;
  publishRequired?: boolean;
  publishTtl?: string;
  publishVisibility?: string;
  artifactGatewayCommand?: string;
}): Promise<RunDeckFactoryResult> {
  if (!options.handoffPath && !options.specPath) {
    fail("Provide either --handoff for OpenClaw planning or --spec for an already approved deck spec.");
  }
  if (options.handoffPath && options.specPath) {
    fail("Provide only one input: --handoff or --spec.");
  }

  const runDir = resolveFromCwd(options.outDir);
  const runSummaryPath = path.join(runDir, "run-summary.json");
  const summary = createRunSummary({
    styleId: options.styleId,
    handoffPath: options.handoffPath,
    specPath: options.specPath
  });
  await writeRunSummary(runSummaryPath, summary);
  try {
  const computerUseMode = resolveComputerUseMode(options.computerUseMode);
  const publishOptions = resolveArtifactPublishOptions({
    publish: options.publish,
    publishRequired: options.publishRequired,
    publishTtl: options.publishTtl,
    publishVisibility: options.publishVisibility,
    artifactGatewayCommand: options.artifactGatewayCommand
  });
  const capabilitiesPath = await writeCapabilitiesManifest(runDir, computerUseMode);
  summary.artifactPaths.capabilities = capabilitiesPath;
  const referenceDeck = options.referenceDeckPath
    ? await assertPowerPointFileRole(options.referenceDeckPath, "reference-deck")
    : null;
  await writePowerPointManifest({
    runDir,
    inputs: referenceDeck ? [referenceDeck] : [],
    outputPath: path.join(runDir, "deck.pptx")
  });
  setGate(summary, "input", "passed", options.handoffPath ? "Validated handoff input path is configured." : "Validated supplied deck spec path is configured.");

  const style = await resolveStylePack(options.styleId);
  setGate(summary, "style-resolution", "passed", `Resolved style ${style.styleId}.`);
  const template = await inspectTemplate(style.templateId);
  const templateProfile = await readJsonFile<TemplateProfile>(resolveFromCwd(template.cachedProfilePath));
  await validateSchema("template-profile", templateProfile);
  setGate(summary, "template-profile", "passed", `Loaded cached template profile for ${template.templateId}.`, template.cachedProfilePath);

  const templateSecurityReportPath = path.join(runDir, "template-security-report.json");
  const securityReport = await scanTemplateSecurity({
    templatePath: resolveFromCwd(template.sourceTemplateDeckPath),
    outPath: templateSecurityReportPath
  });
  summary.artifactPaths.templateSecurityReport = templateSecurityReportPath;
  setGate(summary, "template-security", securityReport.status === "failed" ? "failed" : "passed", `Template security scan ${securityReport.status}.`, templateSecurityReportPath);
  if (securityReport.status === "failed") {
    summary.blockerFindings.push(...securityReport.findings.filter((finding) => finding.severity === "BLOCKER"));
    fail(`Template security scan failed. See report: ${templateSecurityReportPath}`);
  }

  const templateInstructions = await loadTemplateInstructions(style.styleId);
  setGate(
    summary,
    "template-instructions",
    templateInstructions ? "passed" : "skipped",
    templateInstructions ? `Loaded ${templateInstructions.layoutInstructions.length} layout instruction(s).` : "No template instructions configured; using current compatibility behavior."
  );

  const runtimeProvenancePath = path.join(runDir, "runtime-provenance.json");
  await writeRuntimeProvenance({ filePath: runtimeProvenancePath, templateProfile });
  summary.artifactPaths.runtimeProvenance = runtimeProvenancePath;

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
  setGate(summary, "deck-spec", "passed", "Deck spec is schema-valid.", specPath);

  const compliance = await validateDeckSpecTemplateCompliance({ specPath, outDir: runDir, writeReport: true });
  const templateComplianceReportPath = compliance.reportPath ?? path.join(runDir, "template-compliance-report.json");
  summary.artifactPaths.templateComplianceReport = templateComplianceReportPath;
  setGate(
    summary,
    "template-compliance",
    compliance.report.status === "failed" ? "failed" : "passed",
    `Template compliance ${compliance.report.status}.`,
    templateComplianceReportPath
  );
  if (compliance.report.status === "failed") {
    summary.blockerFindings.push(...compliance.report.findings.filter((finding) => finding.severity === "BLOCKER"));
    fail(`Deck spec failed template compliance. See report: ${templateComplianceReportPath}`);
  }
  setGate(summary, "assets", "passed", "No required template-instruction assets are missing.");

  const sourceMapPath = path.join(runDir, "source-map.json");
  await writeSourceMap({ specPath, outPath: sourceMapPath });
  summary.artifactPaths.sourceMap = sourceMapPath;

  let currentSpecPath = specPath;
  let build = await buildDeck({ specPath: currentSpecPath, outDir: runDir });
  setGate(summary, "render", "passed", `Rendered ${build.slideCount} slide(s).`, build.deckPath);
  setGate(summary, "final-deck", "passed", "Final deck path is written.", build.deckPath);
  let qa = await qaDeck({ deckPath: build.deckPath, specPath: currentSpecPath, outDir: runDir, failOnError: false });
  setGate(summary, "package-integrity", qa.report.renderStatus === "passed" ? "passed" : "failed", `Package integrity ${qa.report.renderStatus}.`, qa.reportPath);
  setGate(summary, "rasterization", qa.report.rasterizationStatus === "passed" ? "passed" : "failed", `Rasterization ${qa.report.rasterizationStatus}.`, qa.reportPath);
  setGate(summary, "deterministic-qa", qa.report.status === "passed" ? "passed" : "failed", `Deterministic QA ${qa.report.status}.`, qa.reportPath);
  if (qa.report.status === "passed") {
    qa = await reviewScreenshotsWithOpenClaw({
      specPath: currentSpecPath,
      qaReportPath: qa.reportPath,
      screenshotsDir: qa.screenshotsDir,
      runDir,
      openclawCommand: options.openclawCommand,
      computerUseMode
    });
    setGate(summary, "agentic-review", qa.report.status === "passed" ? "passed" : "failed", `Screenshot review ${qa.report.status}.`, qa.reportPath);
  } else {
    setGate(summary, "agentic-review", "skipped", "Skipped because deterministic QA did not pass.");
  }
  const initialSpec = await readJsonFile<DeckSpec>(currentSpecPath);
  const maxRepairAttempts = options.maxRepairAttempts ?? initialSpec.openclaw.maxRepairAttempts;

  for (let attempt = 1; qa.report.status !== "passed" && attempt <= maxRepairAttempts; attempt += 1) {
    summary.repairAttempts = attempt;
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
    setGate(summary, "render", "passed", `Rendered repaired deck with ${build.slideCount} slide(s).`, build.deckPath);
    qa = await qaDeck({ deckPath: build.deckPath, specPath: currentSpecPath, outDir: runDir, failOnError: false });
    setGate(summary, "package-integrity", qa.report.renderStatus === "passed" ? "passed" : "failed", `Package integrity ${qa.report.renderStatus}.`, qa.reportPath);
    setGate(summary, "rasterization", qa.report.rasterizationStatus === "passed" ? "passed" : "failed", `Rasterization ${qa.report.rasterizationStatus}.`, qa.reportPath);
    setGate(summary, "deterministic-qa", qa.report.status === "passed" ? "passed" : "failed", `Deterministic QA ${qa.report.status}.`, qa.reportPath);
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
  const finalCompliance = await validateDeckSpecTemplateCompliance({ specPath: currentSpecPath, outDir: runDir, writeReport: true });
  if (finalCompliance.report.status === "failed") {
    summary.blockerFindings.push(...finalCompliance.report.findings.filter((finding) => finding.severity === "BLOCKER"));
    fail(`Final deck spec failed template compliance. See report: ${templateComplianceReportPath}`);
  }
  await writeSourceMap({ specPath: currentSpecPath, outPath: sourceMapPath });
  setGate(summary, "repair", summary.repairAttempts > 0 ? "passed" : "skipped", summary.repairAttempts > 0 ? "Repair attempts completed successfully." : "No repair needed.");
  setGate(summary, "handoff-artifacts", "passed", "Run summary, compliance, security, provenance, source map, QA, operations, and deck artifacts are written.");
  summary.status = summary.repairAttempts > 0 ? "repaired" : "passed";
  summary.completedAt = new Date().toISOString();
  summary.outputDeckPath = build.deckPath;
  summary.slideCount = build.slideCount;
  summary.artifactPaths.deck = build.deckPath;
  summary.artifactPaths.operations = build.operationsPath;
  summary.artifactPaths.qaReport = qa.reportPath;
  summary.artifactPaths.runSummary = runSummaryPath;
  const publish = shouldPublishAfterQa(qa.report.status, publishOptions.mode)
    ? await publishFinalDeck({ deckPath: build.deckPath, runDir, publishOptions })
    : { result: null };
  if (publish.result) {
    summary.artifactPaths.publishResult = path.join(runDir, "publish-result.json");
  }
  await writeRunSummary(runSummaryPath, summary);
  return {
    runDir,
    specPath: currentSpecPath,
    deckPath: build.deckPath,
    operationsPath: build.operationsPath,
    qaReportPath: qa.reportPath,
    capabilitiesPath,
    publishResultPath: publish.result ? path.join(runDir, "publish-result.json") : undefined,
    publishResult: publish.result ?? undefined,
    publishWarning: publish.warning,
    runSummaryPath,
    templateComplianceReportPath,
    templateSecurityReportPath,
    runtimeProvenancePath,
    sourceMapPath
  };
  } catch (error) {
    summary.status = "failed";
    summary.completedAt = new Date().toISOString();
    summary.blockerFindings.push({
      id: "run-failed",
      severity: "BLOCKER",
      category: "run",
      message: (error as Error).message
    });
    try {
      await writeRunSummary(runSummaryPath, summary);
    } catch {
      // Preserve the original failure.
    }
    throw error;
  }
}

async function publishFinalDeck(options: {
  deckPath: string;
  runDir: string;
  publishOptions: ArtifactPublishOptions;
}): Promise<{ result: ArtifactPublishResult | null; warning?: string }> {
  return publishDeckArtifact(options);
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
  const templateInstructions = await loadTemplateInstructions(options.styleId);
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
      templateInstructions,
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
      templateInstructions
        ? "Template instructions are present. Choose layouts only from the instruction catalog, include selectionReason on every slide, and fill content by placeholderId where possible."
        : "No template instructions are configured; use the template profile and slide library metadata.",
      "Respect placeholder writing contracts when they are provided.",
      "Do not invent citations or evidence. Preserve source evidence from the handoff.",
      "Return only the deck-spec JSON object."
    ].join("\n")
  });

  const deckSpec = applyOpenClawAgentOverride(result.output as DeckSpec, plannerAgent);
  await validateSchema("deck-spec", deckSpec);
  const runSpecPath = path.join(options.runDir, "deck-spec.json");
  await writeJsonFile(runSpecPath, deckSpec);
  return runSpecPath;
}

function applyOpenClawAgentOverride(spec: DeckSpec, agentId: string): DeckSpec {
  return {
    ...spec,
    slides: normalizeGeneratedSlideLayouts(spec.slides),
    openclaw: {
      ...spec.openclaw,
      plannerAgent: agentId,
      reviewerAgent: agentId,
      polisherAgent: agentId
    }
  };
}

function normalizeGeneratedSlideLayouts(slides: DeckSpec["slides"]): DeckSpec["slides"] {
  return slides?.map((slide) => {
    if (slide.source !== "generated" || (slide.layout !== "two-column" && slide.layoutId !== "two-column")) {
      return slide;
    }
    return {
      ...slide,
      layout: "content",
      layoutId: "content"
    };
  });
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
  const compliance = await validateDeckSpecTemplateCompliance({ specPath: options.specPath });
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
      templateComplianceReport: compliance.report,
      templateInstructions: compliance.instructions,
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
      "If template-compliance findings cite a placeholder contract, revise the deck spec first to satisfy that contract.",
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
    allowTools: true,
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
      "If you are running as an OpenClaw agent, you may use local file or image-inspection tools to inspect the mirrored screenshotsDir.",
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
