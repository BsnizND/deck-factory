import { STYLE_PACK_SCHEMA_VERSION } from "../constants.js";
import { fail } from "../errors.js";
import { validateSchema } from "../schema/validate.js";
import { pathExists, readJsonFile, writeJsonFile } from "../util/fs.js";
import { stylePath } from "./paths.js";

export interface StylePack {
  version: string;
  styleId: string;
  displayName: string;
  templateId: string;
  brandVoice: string;
  defaultAudience: string;
  supportedArchetypes: string[];
  slideLibraries: string[];
  layoutMap: Record<string, string>;
  colorUsageNotes?: string;
  typographyNotes?: string;
  chartStyleNotes?: string;
  imageStyleNotes?: string;
  qaStrictness: "standard" | "strict";
  fallbackPolicy: "fail-closed" | "allow-generated-substitute";
}

export function defaultStylePack(input: {
  styleId: string;
  displayName: string;
  templateId: string;
  supportedArchetypes: string[];
}): StylePack {
  return {
    version: STYLE_PACK_SCHEMA_VERSION,
    styleId: input.styleId,
    displayName: input.displayName,
    templateId: input.templateId,
    brandVoice: "clear, agency-grade, evidence-led",
    defaultAudience: "executive",
    supportedArchetypes: input.supportedArchetypes,
    slideLibraries: [],
    layoutMap: Object.fromEntries(input.supportedArchetypes.map((name) => [name, name])),
    colorUsageNotes: "",
    typographyNotes: "",
    chartStyleNotes: "",
    imageStyleNotes: "",
    qaStrictness: "standard",
    fallbackPolicy: "fail-closed"
  };
}

export async function loadStylePack(styleId: string): Promise<StylePack> {
  const filePath = stylePath(styleId);
  if (!(await pathExists(filePath))) {
    fail(`Style is not registered: ${styleId}`);
  }
  const style = await readJsonFile<StylePack>(filePath);
  await validateSchema("style-pack", style);
  return style;
}

export async function saveStylePack(style: StylePack): Promise<void> {
  await validateSchema("style-pack", style);
  await writeJsonFile(stylePath(style.styleId), style);
}
