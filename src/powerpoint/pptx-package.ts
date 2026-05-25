import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import { fail } from "../errors.js";

const SLIDE_RELATIONSHIP_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";
const NOTES_SLIDE_RELATIONSHIP_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  preserveOrder: false
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  suppressEmptyNode: true,
  format: false
});

interface Relationship {
  Id?: string;
  Type?: string;
  Target?: string;
  TargetMode?: string;
  [key: string]: unknown;
}

interface OverrideEntry {
  PartName?: string;
  ContentType?: string;
  [key: string]: unknown;
}

interface PackageState {
  visibleSlideRelationshipIds: Set<string>;
  visibleSlideParts: Set<string>;
  visibleNotesParts: Set<string>;
  presentationRelationships: Relationship[];
}

export interface PowerPointPackageIssue {
  type: string;
  detail: string;
  path?: string;
  relationshipId?: string;
  target?: string;
}

export interface PowerPointPackageNormalizationResult {
  changed: boolean;
  removedPaths: string[];
  removedRelationships: string[];
  removedContentTypeOverrides: string[];
  updatedPaths: string[];
}

export async function normalizePowerPointPackage(deckPath: string): Promise<PowerPointPackageNormalizationResult> {
  const zip = await loadPptx(deckPath);
  const result = await normalizeZip(zip);
  if (result.changed) {
    const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    await writeFile(deckPath, bytes);
  }
  return result;
}

export async function inspectPowerPointPackage(deckPath: string): Promise<PowerPointPackageIssue[]> {
  const zip = await loadPptx(deckPath);
  const state = await readPackageState(zip);
  const issues: PowerPointPackageIssue[] = [];

  for (const relationship of state.presentationRelationships) {
    if (relationship.Type !== SLIDE_RELATIONSHIP_TYPE) {
      continue;
    }
    if (!relationship.Id || !state.visibleSlideRelationshipIds.has(relationship.Id)) {
      issues.push({
        type: "stale-presentation-slide-relationship",
        detail: "presentation.xml.rels contains a slide relationship that is not in presentation.xml's visible slide list.",
        relationshipId: relationship.Id,
        target: relationship.Target
      });
    }
  }

  for (const slidePart of listZipFiles(zip, /^ppt\/slides\/slide\d+\.xml$/)) {
    if (!state.visibleSlideParts.has(slidePart)) {
      issues.push({
        type: "orphan-slide-part",
        detail: "The PPTX contains a slide part that is not referenced by the visible slide list.",
        path: slidePart
      });
    }
  }

  for (const notesPart of listZipFiles(zip, /^ppt\/notesSlides\/notesSlide\d+\.xml$/)) {
    if (!state.visibleNotesParts.has(notesPart)) {
      issues.push({
        type: "orphan-notes-slide-part",
        detail: "The PPTX contains a notes slide part that is not referenced by a visible slide.",
        path: notesPart
      });
    }
  }

  issues.push(...(await inspectContentTypeOverrides(zip)));
  issues.push(...(await inspectRelationshipTargets(zip)));
  return issues;
}

async function normalizeZip(zip: JSZip): Promise<PowerPointPackageNormalizationResult> {
  const state = await readPackageState(zip);
  const removedPaths: string[] = [];
  const removedRelationships: string[] = [];
  const removedContentTypeOverrides: string[] = [];
  const updatedPaths: string[] = [];

  const keptPresentationRelationships = state.presentationRelationships.filter((relationship) => {
    if (relationship.Type !== SLIDE_RELATIONSHIP_TYPE) {
      return true;
    }
    const keep = Boolean(relationship.Id && state.visibleSlideRelationshipIds.has(relationship.Id));
    if (!keep) {
      removedRelationships.push(relationship.Id ?? relationship.Target ?? "(unknown slide relationship)");
    }
    return keep;
  });
  if (keptPresentationRelationships.length !== state.presentationRelationships.length) {
    await writeRelationships(zip, "ppt/_rels/presentation.xml.rels", keptPresentationRelationships);
    updatedPaths.push("ppt/_rels/presentation.xml.rels");
  }

  for (const slidePart of listZipFiles(zip, /^ppt\/slides\/slide\d+\.xml$/)) {
    if (!state.visibleSlideParts.has(slidePart)) {
      removeZipPath(zip, slidePart, removedPaths);
      removeZipPath(zip, slideRelationshipPath(slidePart), removedPaths);
    }
  }

  for (const notesPart of listZipFiles(zip, /^ppt\/notesSlides\/notesSlide\d+\.xml$/)) {
    if (!state.visibleNotesParts.has(notesPart)) {
      removeZipPath(zip, notesPart, removedPaths);
      removeZipPath(zip, notesRelationshipPath(notesPart), removedPaths);
    }
  }

  const contentTypesChanged = await normalizeContentTypes(zip, removedContentTypeOverrides);
  if (contentTypesChanged) {
    updatedPaths.push("[Content_Types].xml");
  }

  const appPropsChanged = await normalizeAppProperties(zip, state.visibleSlideParts.size, state.visibleNotesParts.size);
  if (appPropsChanged) {
    updatedPaths.push("docProps/app.xml");
  }

  return {
    changed: removedPaths.length > 0 || removedRelationships.length > 0 || removedContentTypeOverrides.length > 0 || updatedPaths.length > 0,
    removedPaths,
    removedRelationships,
    removedContentTypeOverrides,
    updatedPaths
  };
}

async function loadPptx(deckPath: string): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(await readFile(deckPath));
  } catch (error) {
    fail(`Unable to read PPTX package ${deckPath}: ${(error as Error).message}`);
  }
}

async function readPackageState(zip: JSZip): Promise<PackageState> {
  const presentationXml = await zip.file("ppt/presentation.xml")?.async("text");
  if (!presentationXml) {
    fail("PPTX is missing ppt/presentation.xml.");
  }
  const visibleSlideRelationshipIds = new Set(
    [...presentationXml.matchAll(/<(?:\w+:)?sldId\b[^>]*\br:id="([^"]+)"/g)].map((match) => match[1])
  );
  const presentationRelationships = await readRelationships(zip, "ppt/_rels/presentation.xml.rels");
  const visibleSlideParts = new Set<string>();
  const visibleNotesParts = new Set<string>();

  for (const relationship of presentationRelationships) {
    if (
      relationship.Type === SLIDE_RELATIONSHIP_TYPE &&
      relationship.Id &&
      visibleSlideRelationshipIds.has(relationship.Id) &&
      relationship.Target &&
      relationship.TargetMode !== "External"
    ) {
      const slidePart = resolveRelationshipTarget("ppt", relationship.Target);
      visibleSlideParts.add(slidePart);
      const slideRelationships = await readRelationships(zip, slideRelationshipPath(slidePart), { allowMissing: true });
      for (const slideRelationship of slideRelationships) {
        if (
          slideRelationship.Type === NOTES_SLIDE_RELATIONSHIP_TYPE &&
          slideRelationship.Target &&
          slideRelationship.TargetMode !== "External"
        ) {
          visibleNotesParts.add(resolveRelationshipTarget(path.posix.dirname(slidePart), slideRelationship.Target));
        }
      }
    }
  }

  return {
    visibleSlideRelationshipIds,
    visibleSlideParts,
    visibleNotesParts,
    presentationRelationships
  };
}

async function readRelationships(
  zip: JSZip,
  relsPath: string,
  options: { allowMissing?: boolean } = {}
): Promise<Relationship[]> {
  const xml = await zip.file(relsPath)?.async("text");
  if (!xml) {
    if (options.allowMissing) {
      return [];
    }
    fail(`PPTX is missing relationship part: ${relsPath}`);
  }
  const doc = parser.parse(xml) as { Relationships?: { Relationship?: Relationship | Relationship[] } };
  return asArray(doc.Relationships?.Relationship);
}

async function writeRelationships(zip: JSZip, relsPath: string, relationships: Relationship[]): Promise<void> {
  const xml = await zip.file(relsPath)?.async("text");
  if (!xml) {
    fail(`PPTX is missing relationship part: ${relsPath}`);
  }
  const doc = parser.parse(xml) as { Relationships?: { Relationship?: Relationship | Relationship[]; [key: string]: unknown } };
  if (!doc.Relationships) {
    fail(`Relationship part has invalid XML root: ${relsPath}`);
  }
  doc.Relationships.Relationship = relationships;
  zip.file(relsPath, builder.build(doc));
}

async function inspectContentTypeOverrides(zip: JSZip): Promise<PowerPointPackageIssue[]> {
  const xml = await zip.file("[Content_Types].xml")?.async("text");
  if (!xml) {
    return [
      {
        type: "missing-content-types",
        detail: "PPTX is missing [Content_Types].xml."
      }
    ];
  }
  const doc = parser.parse(xml) as { Types?: { Override?: OverrideEntry | OverrideEntry[] } };
  const overrides = asArray(doc.Types?.Override);
  const seen = new Set<string>();
  const issues: PowerPointPackageIssue[] = [];
  for (const override of overrides) {
    if (!override.PartName) {
      continue;
    }
    if (seen.has(override.PartName)) {
      issues.push({
        type: "duplicate-content-type-override",
        detail: "The PPTX content types part contains a duplicate Override PartName.",
        path: override.PartName
      });
      continue;
    }
    seen.add(override.PartName);
    const packagePath = override.PartName.replace(/^\//, "");
    if (!zip.file(packagePath)) {
      issues.push({
        type: "missing-content-type-target",
        detail: "The PPTX content types part declares an Override for a package part that does not exist.",
        path: override.PartName
      });
    }
  }
  return issues;
}

async function inspectRelationshipTargets(zip: JSZip): Promise<PowerPointPackageIssue[]> {
  const issues: PowerPointPackageIssue[] = [];
  for (const relsPath of listZipFiles(zip, /(^|\/)_rels\/.+\.rels$/)) {
    const relationships = await readRelationships(zip, relsPath, { allowMissing: true });
    const baseDir = relationshipSourceBaseDir(relsPath);
    for (const relationship of relationships) {
      if (!relationship.Target || relationship.TargetMode === "External") {
        continue;
      }
      const targetPath = resolveRelationshipTarget(baseDir, relationship.Target);
      if (!zip.file(targetPath)) {
        issues.push({
          type: "missing-relationship-target",
          detail: "A relationship target does not exist in the PPTX package.",
          path: relsPath,
          relationshipId: relationship.Id,
          target: relationship.Target
        });
      }
    }
  }
  return issues;
}

async function normalizeContentTypes(zip: JSZip, removedContentTypeOverrides: string[]): Promise<boolean> {
  const xml = await zip.file("[Content_Types].xml")?.async("text");
  if (!xml) {
    fail("PPTX is missing [Content_Types].xml.");
  }
  const doc = parser.parse(xml) as { Types?: { Override?: OverrideEntry | OverrideEntry[]; [key: string]: unknown } };
  if (!doc.Types) {
    fail("PPTX [Content_Types].xml has invalid XML root.");
  }
  const overrides = asArray(doc.Types.Override);
  const seen = new Set<string>();
  const kept: OverrideEntry[] = [];
  for (const override of overrides) {
    if (!override.PartName) {
      kept.push(override);
      continue;
    }
    const packagePath = override.PartName.replace(/^\//, "");
    const shouldRemove = seen.has(override.PartName) || !zip.file(packagePath);
    if (shouldRemove) {
      removedContentTypeOverrides.push(override.PartName);
      continue;
    }
    seen.add(override.PartName);
    kept.push(override);
  }
  if (kept.length === overrides.length) {
    return false;
  }
  doc.Types.Override = kept;
  zip.file("[Content_Types].xml", builder.build(doc));
  return true;
}

async function normalizeAppProperties(zip: JSZip, slideCount: number, notesCount: number): Promise<boolean> {
  const appPropsPath = "docProps/app.xml";
  const xml = await zip.file(appPropsPath)?.async("text");
  if (!xml) {
    return false;
  }
  const updated = xml
    .replace(/<Slides>\d+<\/Slides>/, `<Slides>${slideCount}</Slides>`)
    .replace(/<Notes>\d+<\/Notes>/, `<Notes>${notesCount}</Notes>`);
  if (updated === xml) {
    return false;
  }
  zip.file(appPropsPath, updated);
  return true;
}

function listZipFiles(zip: JSZip, pattern: RegExp): string[] {
  return Object.values(zip.files)
    .filter((entry) => !entry.dir && pattern.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function removeZipPath(zip: JSZip, packagePath: string, removedPaths: string[]): void {
  if (zip.file(packagePath)) {
    zip.remove(packagePath);
    removedPaths.push(packagePath);
  }
}

function slideRelationshipPath(slidePart: string): string {
  return slidePart.replace(/^ppt\/slides\/(slide\d+\.xml)$/, "ppt/slides/_rels/$1.rels");
}

function notesRelationshipPath(notesPart: string): string {
  return notesPart.replace(/^ppt\/notesSlides\/(notesSlide\d+\.xml)$/, "ppt/notesSlides/_rels/$1.rels");
}

function relationshipSourceBaseDir(relsPath: string): string {
  if (relsPath === "_rels/.rels") {
    return "";
  }
  return relsPath.replace(/\/_rels\/[^/]+\.rels$/, "");
}

function resolveRelationshipTarget(baseDir: string, target: string): string {
  const withoutFragment = target.split("#")[0] ?? target;
  return path.posix.normalize(path.posix.join(baseDir, withoutFragment)).replace(/^\.\//, "");
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}
