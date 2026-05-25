import { readdir } from "node:fs/promises";
import { STYLE_PACK_SCHEMA_VERSION } from "../constants.js";
import { fail } from "../errors.js";
import { validateSchema } from "../schema/validate.js";
import { pathExists, readJsonFile, writeJsonFile } from "../util/fs.js";
import { stylePath, stylesDir } from "./paths.js";

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

export async function listStylePacks(): Promise<StylePack[]> {
  if (!(await pathExists(stylesDir()))) {
    return [];
  }
  const files = (await readdir(stylesDir())).filter((fileName) => fileName.endsWith(".json")).sort();
  const styles: StylePack[] = [];
  for (const fileName of files) {
    const style = await readJsonFile<StylePack>(stylePath(fileName.replace(/\.json$/, "")));
    await validateSchema("style-pack", style);
    styles.push(style);
  }
  return styles;
}

export async function resolveStylePack(input: string): Promise<StylePack> {
  const styles = await listStylePacks();
  const normalizedInput = normalizeStyleName(input);
  const exact = styles.find((style) => style.styleId === input);
  if (exact) {
    return exact;
  }
  const displayMatch = styles.find((style) => style.displayName === input);
  if (displayMatch) {
    return displayMatch;
  }
  const normalized = styles.find(
    (style) => normalizeStyleName(style.styleId) === normalizedInput || normalizeStyleName(style.displayName) === normalizedInput
  );
  if (normalized) {
    return normalized;
  }
  const knownStyles = styles.map((style) => `${style.displayName} (${style.styleId})`).join(", ") || "none";
  fail(
    `Style is not registered: ${input}. Register a prepared .pptx template deck first with ` +
      `deck-factory templates register --id <style-id> --name "<display name>" --template-deck <path>. Known styles: ${knownStyles}`
  );
}

export async function saveStylePack(style: StylePack): Promise<void> {
  await validateSchema("style-pack", style);
  await writeJsonFile(stylePath(style.styleId), style);
}

function normalizeStyleName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
