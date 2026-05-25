import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import {
  EXTRACTOR_VERSION,
  TEMPLATE_PROFILE_SCHEMA_VERSION
} from "../constants.js";
import { validateSchema } from "../schema/validate.js";

export interface TemplateProfile {
  version: string;
  templateId: string;
  sourceTemplateDeckPath: string;
  sourceFileRole: "template-deck";
  sourceContentHash: string;
  extractorVersion: string;
  slideSize: { width: number | null; height: number | null };
  themeColors: string[];
  themeFonts: string[];
  masters: string[];
  layouts: Array<{ id: string; name: string; sourceSlide?: number }>;
  representativeSlides: Array<{ slideNumber: number; title: string | null; notes: string | null }>;
  placeholders: Array<{ slideNumber: number; name: string; type: string | null }>;
  shapes: Array<{ slideNumber: number; name: string; type: string }>;
  detectedPatterns: Array<{ name: string; confidence: number; evidence: string }>;
  preparationStatus: "ready" | "needs-prep" | "unsupported";
  preparationFindings: Array<{ severity: "info" | "warning" | "error"; message: string }>;
  warnings: string[];
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

export async function extractTemplateProfile(input: {
  sourceTemplateDeckPath: string;
  sourceContentHash: string;
  templateId: string;
}): Promise<TemplateProfile> {
  const zip = await JSZip.loadAsync(await readFile(input.sourceTemplateDeckPath));
  const presentationXml = await zip.file("ppt/presentation.xml")?.async("text");
  const presentation = presentationXml ? parser.parse(presentationXml) : {};
  const slideSize = extractSlideSize(presentation);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
  const representativeSlides = await Promise.all(
    slideFiles.map(async (file) => inspectSlide(zip, file))
  );
  const detectedPatterns = detectPatterns(representativeSlides);
  const preparationFindings = preparationFindingsFor(slideFiles.length, detectedPatterns, slideSize);
  const preparationStatus = preparationFindings.some((finding) => finding.severity === "error")
    ? "unsupported"
    : preparationFindings.some((finding) => finding.severity === "warning")
      ? "needs-prep"
      : "ready";
  const profile: TemplateProfile = {
    version: TEMPLATE_PROFILE_SCHEMA_VERSION,
    templateId: input.templateId,
    sourceTemplateDeckPath: input.sourceTemplateDeckPath,
    sourceFileRole: "template-deck",
    sourceContentHash: input.sourceContentHash,
    extractorVersion: EXTRACTOR_VERSION,
    slideSize,
    themeColors: [],
    themeFonts: [],
    masters: [],
    layouts: detectedPatterns.map((pattern, index) => ({
      id: pattern.name,
      name: pattern.name,
      sourceSlide: representativeSlides[index]?.slideNumber
    })),
    representativeSlides,
    placeholders: [],
    shapes: [],
    detectedPatterns,
    preparationStatus,
    preparationFindings,
    warnings: []
  };
  await validateSchema("template-profile", profile);
  return profile;
}

async function inspectSlide(zip: JSZip, file: string): Promise<{ slideNumber: number; title: string | null; notes: string | null }> {
  const xml = await zip.file(file)?.async("text");
  const parsed = xml ? parser.parse(xml) : {};
  const text = JSON.stringify(parsed).match(/DF_LAYOUT:\s*([a-z0-9_-]+)/i)?.[1] ?? null;
  return { slideNumber: slideNumber(file), title: text, notes: null };
}

function extractSlideSize(presentation: Record<string, unknown>): { width: number | null; height: number | null } {
  const size = findKey(presentation, "p:sldSz") as Record<string, unknown> | null;
  return {
    width: typeof size?.cx === "string" ? Number(size.cx) : null,
    height: typeof size?.cy === "string" ? Number(size.cy) : null
  };
}

function findKey(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(value, key)) {
    return (value as Record<string, unknown>)[key];
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    const found = findKey(child, key);
    if (found) {
      return found;
    }
  }
  return null;
}

function detectPatterns(slides: Array<{ slideNumber: number; title: string | null }>): Array<{ name: string; confidence: number; evidence: string }> {
  return slides.map((slide) => ({
    name: slide.title ?? `slide-${slide.slideNumber}`,
    confidence: slide.title ? 0.9 : 0.3,
    evidence: slide.title ? `Found DF_LAYOUT tag on slide ${slide.slideNumber}` : `No DF_LAYOUT tag on slide ${slide.slideNumber}`
  }));
}

function preparationFindingsFor(
  slideCount: number,
  patterns: Array<{ name: string; confidence: number }>,
  slideSize: { width: number | null; height: number | null }
): Array<{ severity: "info" | "warning" | "error"; message: string }> {
  const findings: Array<{ severity: "info" | "warning" | "error"; message: string }> = [];
  if (slideCount === 0) {
    findings.push({ severity: "error", message: "No slides found in template deck." });
  }
  if (!slideSize.width || !slideSize.height) {
    findings.push({ severity: "warning", message: "Could not read slide size from presentation.xml." });
  }
  if (!patterns.some((pattern) => pattern.name.toLowerCase().includes("title"))) {
    findings.push({ severity: "warning", message: "No title/cover pattern detected. Add a DF_LAYOUT: title marker." });
  }
  if (!patterns.some((pattern) => /content|body|two-column/.test(pattern.name.toLowerCase()))) {
    findings.push({ severity: "warning", message: "No body/content pattern detected. Add a DF_LAYOUT: content marker." });
  }
  if (findings.length === 0) {
    findings.push({ severity: "info", message: "Template deck has enough structure for initial extraction." });
  }
  return findings;
}

function slideNumber(file: string): number {
  return Number(file.match(/slide(\d+)\.xml$/)?.[1] ?? "0");
}
