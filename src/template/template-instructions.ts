import path from "node:path";
import { TEMPLATE_INSTRUCTIONS_SCHEMA_VERSION } from "../constants.js";
import { fail } from "../errors.js";
import { templateInstructionsPath } from "../registry/paths.js";
import { inspectTemplate } from "../registry/template-registry.js";
import { validateSchema } from "../schema/validate.js";
import type { TemplateProfile } from "./extract-template-profile.js";
import { pathExists, readJsonFile, resolveFromCwd, toPortablePath, writeJsonFile } from "../util/fs.js";

export interface TemplateInstructions {
  version: string;
  styleId: string;
  layoutInstructions: LayoutInstruction[];
}

export interface LayoutInstruction {
  layoutId: string;
  displayName: string;
  slideKind: "recommendation" | "section" | "content" | "comparison" | "chart" | "table" | "quote" | "appendix" | "custom";
  narrativeRole: string;
  useWhen: string[];
  avoidWhen: string[];
  worksFor: string[];
  contentVoice: string;
  requiredPlaceholders: string[];
  optionalPlaceholders: string[];
  placeholderContracts: Record<string, PlaceholderContract>;
  assetGuidance: {
    imageRole: string;
    imageShouldShow: string;
    avoid: string[];
  };
}

export interface PlaceholderContract {
  role: string;
  contentKind: string;
  writeAs: string;
  voice: string;
  minItems: number | null;
  maxItems: number | null;
  maxCharacters: number | null;
  maxCharactersPerItem: number | null;
  requiresCitations: boolean;
  requiresAsset: boolean;
  validationHints: string[];
}

export async function loadTemplateInstructions(styleId: string): Promise<TemplateInstructions | null> {
  const filePath = templateInstructionsPath(styleId);
  if (!(await pathExists(filePath))) {
    return null;
  }
  const instructions = await readJsonFile<TemplateInstructions>(filePath);
  await validateTemplateInstructions(instructions, styleId);
  return instructions;
}

export async function inspectTemplateInstructions(styleId: string): Promise<TemplateInstructions> {
  const instructions = await loadTemplateInstructions(styleId);
  if (!instructions) {
    fail(`No template instructions are registered for style: ${styleId}. Run templates instructions init ${styleId}.`);
  }
  return instructions;
}

export async function initTemplateInstructions(styleId: string, options: { force?: boolean } = {}): Promise<TemplateInstructions> {
  const filePath = templateInstructionsPath(styleId);
  if ((await pathExists(filePath)) && !options.force) {
    return inspectTemplateInstructions(styleId);
  }
  const template = await inspectTemplate(styleId);
  const profile = await readJsonFile<TemplateProfile>(resolveFromCwd(template.cachedProfilePath));
  await validateSchema("template-profile", profile);
  const instructions: TemplateInstructions = {
    version: TEMPLATE_INSTRUCTIONS_SCHEMA_VERSION,
    styleId,
    layoutInstructions: profile.layouts.map((layout) => defaultInstructionForLayout(layout.id, layout.name))
  };
  await validateTemplateInstructions(instructions, styleId);
  await writeJsonFile(filePath, instructions);
  return instructions;
}

export async function validateTemplateInstructions(instructions: TemplateInstructions, expectedStyleId?: string): Promise<void> {
  await validateSchema("template-instructions", instructions);
  if (expectedStyleId && instructions.styleId !== expectedStyleId) {
    fail(`Template instructions styleId ${instructions.styleId} does not match expected style ${expectedStyleId}.`);
  }
  const seenLayouts = new Set<string>();
  for (const layout of instructions.layoutInstructions) {
    if (seenLayouts.has(layout.layoutId)) {
      fail(`Template instructions contain duplicate layoutId: ${layout.layoutId}`);
    }
    seenLayouts.add(layout.layoutId);
    const allowed = new Set([...layout.requiredPlaceholders, ...layout.optionalPlaceholders]);
    for (const placeholderId of Object.keys(layout.placeholderContracts)) {
      if (!allowed.has(placeholderId)) {
        fail(`Template instructions layout ${layout.layoutId} has a contract for unknown placeholder ${placeholderId}.`);
      }
    }
    for (const placeholderId of layout.requiredPlaceholders) {
      if (!layout.placeholderContracts[placeholderId]) {
        fail(`Template instructions layout ${layout.layoutId} requires placeholder ${placeholderId} but has no contract for it.`);
      }
    }
  }
}

export function templateInstructionsPortablePath(styleId: string): string {
  return toPortablePath(templateInstructionsPath(styleId));
}

function defaultInstructionForLayout(layoutId: string, displayName: string): LayoutInstruction {
  const isTitle = /title|cover/i.test(layoutId);
  const requiredPlaceholders = isTitle ? ["df_title"] : ["df_title", "df_body"];
  return {
    layoutId,
    displayName,
    slideKind: isTitle ? "section" : "content",
    narrativeRole: isTitle
      ? "Introduce a deck or major section with a clear title and compact setup."
      : "Communicate one focused idea using an action title and concise supporting content.",
    useWhen: isTitle
      ? ["The story needs an opening, transition, or section break."]
      : ["The slide needs one main point with compact supporting evidence."],
    avoidWhen: isTitle
      ? ["The audience needs detailed evidence or a dense analytical argument."]
      : ["The content needs a full table, chart, comparison grid, or more than one central idea."],
    worksFor: isTitle ? ["cover", "section divider", "transition"] : ["executive update", "research readout", "recommendation support"],
    contentVoice: "clear, specific, and concise",
    requiredPlaceholders,
    optionalPlaceholders: ["df_footer", "df_subtitle", "df_image"],
    placeholderContracts: Object.fromEntries(
      requiredPlaceholders.map((placeholderId) => [
        placeholderId,
        placeholderId === "df_body" ? defaultBodyContract() : defaultTitleContract()
      ])
    ),
    assetGuidance: {
      imageRole: "supporting visual",
      imageShouldShow: "real product, customer context, operating environment, chart, table, or source artifact",
      avoid: ["generic stock imagery", "abstract gradients", "untraceable decorative images"]
    }
  };
}

function defaultTitleContract(): PlaceholderContract {
  return {
    role: "action-title",
    contentKind: "single-sentence claim",
    writeAs: "State the slide takeaway, not just the topic.",
    voice: "direct and specific",
    minItems: 1,
    maxItems: 1,
    maxCharacters: 105,
    maxCharactersPerItem: null,
    requiresCitations: false,
    requiresAsset: false,
    validationHints: ["Prefer a concrete verb.", "Avoid vague labels such as Overview or Recommendation."]
  };
}

function defaultBodyContract(): PlaceholderContract {
  return {
    role: "supporting-body",
    contentKind: "short paragraph or bullet list",
    writeAs: "Support the action title with concise evidence or implications.",
    voice: "consultative and compact",
    minItems: null,
    maxItems: 5,
    maxCharacters: 700,
    maxCharactersPerItem: 180,
    requiresCitations: false,
    requiresAsset: false,
    validationHints: ["Split dense evidence across slides.", "Keep bullets short enough for PowerPoint layout."]
  };
}
