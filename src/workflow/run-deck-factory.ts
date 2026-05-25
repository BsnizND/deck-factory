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

  const build = await buildDeck({ specPath, outDir: runDir });
  await qaDeck({ deckPath: build.deckPath, specPath, outDir: runDir });
  return {
    runDir,
    specPath,
    deckPath: build.deckPath,
    operationsPath: build.operationsPath,
    qaReportPath: path.join(runDir, "qa-report.json")
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
