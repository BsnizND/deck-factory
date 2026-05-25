import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import JSZip from "jszip";
import {
  EXTRACTOR_VERSION,
  SLIDE_LIBRARY_SCHEMA_VERSION
} from "../constants.js";
import { fail } from "../errors.js";
import { validateSchema } from "../schema/validate.js";
import { assertReadableFile, pathExists, resolveFromCwd, toPortablePath, writeJsonFile, readJsonFile, writeTextFile } from "../util/fs.js";
import { fingerprintFile } from "./fingerprint.js";
import { libraryPrepReportPath, slideLibraryPath } from "./paths.js";
import { loadStylePack, saveStylePack } from "./style-pack.js";

export interface SlideLibrary {
  version: string;
  styleId: string;
  libraryId: string;
  displayName: string;
  sourceLibraryDeckPath: string;
  sourceContentHash: string;
  extractorVersion: string;
  prepReportPath: string;
  slides: SlideLibraryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface SlideLibraryEntry {
  slideId: string;
  displayName: string;
  kind: "full-built" | "parameterized" | "pattern" | "appendix";
  sourceSlideNumber: number;
  sourceStableSlideId: string;
  tags: string[];
  supportedArchetypes: string[];
  insertionRules: string[];
  requiredFields: string[];
  optionalFields: string[];
  lockedElements: string[];
  editableElements: string[];
  thumbnailPath: string | null;
  fingerprint: string;
  usageNotes: string;
}

export async function registerSlideLibrary(options: {
  styleId: string;
  libraryDeckPath: string;
  displayName?: string;
  force?: boolean;
}): Promise<SlideLibrary> {
  const style = await loadStylePack(options.styleId);
  const sourcePath = resolveFromCwd(options.libraryDeckPath);
  await assertPptx(sourcePath, "slide library deck");
  const sourceContentHash = await fingerprintFile(sourcePath);
  const filePath = slideLibraryPath(options.styleId);
  const prepReportPath = libraryPrepReportPath(options.styleId);
  const portablePrepReportPath = toPortablePath(prepReportPath);
  const existing = (await pathExists(filePath)) ? await readJsonFile<SlideLibrary>(filePath) : null;
  if (
    existing &&
    !options.force &&
    existing.sourceContentHash === sourceContentHash &&
    existing.extractorVersion === EXTRACTOR_VERSION
  ) {
    await ensureStyleReferencesLibrary(style, options.styleId);
    await writeLibraryPrepReport(prepReportPath, existing);
    return existing;
  }

  const slides = await extractLibraryEntries(sourcePath);
  const now = new Date().toISOString();
  const library: SlideLibrary = {
    version: SLIDE_LIBRARY_SCHEMA_VERSION,
    styleId: options.styleId,
    libraryId: options.styleId,
    displayName: options.displayName ?? `${style.displayName} Slide Library`,
    sourceLibraryDeckPath: toPortablePath(sourcePath),
    sourceContentHash,
    extractorVersion: EXTRACTOR_VERSION,
    prepReportPath: portablePrepReportPath,
    slides,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  await validateSchema("slide-library", library);
  await writeJsonFile(filePath, library);
  await writeLibraryPrepReport(prepReportPath, library);
  await ensureStyleReferencesLibrary(style, options.styleId);
  return library;
}

export async function loadSlideLibrary(styleId: string): Promise<SlideLibrary> {
  const filePath = slideLibraryPath(styleId);
  if (!(await pathExists(filePath))) {
    fail(`No slide library is registered for style: ${styleId}`);
  }
  const library = await readJsonFile<SlideLibrary>(filePath);
  await validateSchema("slide-library", library);
  return library;
}

async function extractLibraryEntries(filePath: string): Promise<SlideLibraryEntry[]> {
  const zip = await JSZip.loadAsync(await readFile(filePath));
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
  if (slideFiles.length === 0) {
    fail(`Slide library deck contains no slides: ${filePath}`);
  }
  return Promise.all(
    slideFiles.map(async (slideFile) => {
      const xml = (await zip.file(slideFile)?.async("text")) ?? "";
      const number = slideNumber(slideFile);
      const taggedId = xml.match(/DF_LIBRARY:\s*([a-z0-9_-]+)/i)?.[1];
      const taggedKind = xml.match(/DF_KIND:\s*(full-built|parameterized|pattern|appendix)/i)?.[1] as
        | SlideLibraryEntry["kind"]
        | undefined;
      return {
        slideId: taggedId ?? `slide-${number}`,
        displayName: taggedId ?? `Slide ${number}`,
        kind: taggedKind ?? "full-built",
        sourceSlideNumber: number,
        sourceStableSlideId: `slide-${number}`,
        tags: [],
        supportedArchetypes: [],
        insertionRules: [],
        requiredFields: [...xml.matchAll(/\{\{([a-zA-Z0-9_-]+)\}\}/g)].map((match) => match[1]),
        optionalFields: [],
        lockedElements: [],
        editableElements: [],
        thumbnailPath: null,
        fingerprint: createHash("sha256").update(xml).digest("hex"),
        usageNotes: taggedId ? `Found DF_LIBRARY tag ${taggedId}` : "No DF_LIBRARY tag found; generated slide id from slide number."
      };
    })
  );
}

async function assertPptx(filePath: string, role: string): Promise<void> {
  await assertReadableFile(filePath);
  if (path.extname(filePath).toLowerCase() !== ".pptx") {
    fail(`Expected ${role} to be a .pptx file for v0: ${filePath}`);
  }
}

function slideNumber(file: string): number {
  return Number(file.match(/slide(\d+)\.xml$/)?.[1] ?? "0");
}

async function ensureStyleReferencesLibrary(style: Awaited<ReturnType<typeof loadStylePack>>, libraryId: string): Promise<void> {
  if (!style.slideLibraries.includes(libraryId)) {
    await saveStylePack({ ...style, slideLibraries: [...style.slideLibraries, libraryId].sort() });
  }
}

async function writeLibraryPrepReport(filePath: string, library: SlideLibrary): Promise<void> {
  const slides = library.slides
    .map((slide) =>
      [
        `- ${slide.slideId} (${slide.kind})`,
        `  - source slide: ${slide.sourceSlideNumber}`,
        `  - required fields: ${slide.requiredFields.join(", ") || "none"}`,
        `  - fingerprint: ${slide.fingerprint}`
      ].join("\n")
    )
    .join("\n");
  await writeTextFile(
    filePath,
    [
      `# Slide Library Prep Report: ${library.displayName}`,
      "",
      `- Style id: ${library.styleId}`,
      `- Library id: ${library.libraryId}`,
      `- Source deck: ${library.sourceLibraryDeckPath}`,
      `- Source hash: ${library.sourceContentHash}`,
      `- Extractor version: ${library.extractorVersion}`,
      `- Slide count: ${library.slides.length}`,
      "",
      "## Indexed Slides",
      "",
      slides || "- No library slides detected.",
      "",
      "## Library Preparation Contract",
      "",
      "- Use `DF_LIBRARY: slide-id` markers to assign stable reusable slide ids.",
      "- Use `DF_KIND: full-built`, `parameterized`, `pattern`, or `appendix` to classify each slide.",
      "- Use `{{field}}` tags for parameterized editable fields.",
      "- Keep evergreen slides fully built when they should be inserted unchanged."
    ].join("\n")
  );
}
