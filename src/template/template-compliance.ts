import path from "node:path";
import { TEMPLATE_COMPLIANCE_REPORT_SCHEMA_VERSION } from "../constants.js";
import { loadSlideLibrary } from "../registry/slide-library.js";
import { loadStylePack } from "../registry/style-pack.js";
import { inspectTemplate } from "../registry/template-registry.js";
import { highestStatusFromFindings, type SeverityFinding } from "../reports/severity.js";
import { validateSchema } from "../schema/validate.js";
import { readJsonFile, resolveFromCwd, writeJsonFile } from "../util/fs.js";
import type { TemplateProfile } from "./extract-template-profile.js";
import { loadTemplateInstructions, templateInstructionsPortablePath, type LayoutInstruction, type TemplateInstructions } from "./template-instructions.js";

interface DeckSpec {
  style: { styleId?: string };
  assets?: Array<{ id?: string; assetId?: string; path?: string }>;
  slides: DeckSpecSlide[];
}

interface DeckSpecSlide {
  id: string;
  source?: string;
  layout?: string;
  layoutId?: string;
  librarySlideId?: string;
  purpose?: string;
  selectionReason?: string;
  title?: string;
  actionTitle?: string;
  content?: ContentBlock[];
  assets?: Array<{ placeholderId?: string; assetId?: string; path?: string; selectionReason?: string }>;
  citations?: string[];
}

interface ContentBlock {
  placeholderId?: string;
  value?: string;
  text?: string;
  items?: Array<string | { label?: string; text?: string }>;
  fields?: Record<string, string>;
  columns?: unknown[];
}

export interface TemplateComplianceReport {
  version: string;
  status: "passed" | "warning" | "failed";
  styleId: string;
  instructionsPath: string | null;
  slides: TemplateComplianceSlideReport[];
  findings: SeverityFinding[];
}

export interface TemplateComplianceSlideReport {
  slideId: string;
  layoutId: string;
  usedRegisteredLayout: boolean;
  allRequiredPlaceholdersFilled: boolean;
  unknownPlaceholders: string[];
  missingRequiredPlaceholders: string[];
  requiredAssetsPresent: boolean;
  requiredCitationsPresent: boolean;
  slideLibrarySourceId: string | null;
  findings: SeverityFinding[];
}

export async function validateDeckSpecTemplateCompliance(options: {
  specPath: string;
  outDir?: string;
  writeReport?: boolean;
}): Promise<{ report: TemplateComplianceReport; reportPath: string | null; instructions: TemplateInstructions | null }> {
  const spec = await readJsonFile<DeckSpec>(resolveFromCwd(options.specPath));
  await validateSchema("deck-spec", spec);
  const styleId = spec.style.styleId;
  if (!styleId) {
    throw new Error("Deck spec is missing style.styleId.");
  }
  const style = await loadStylePack(styleId);
  const template = await inspectTemplate(style.templateId);
  const profile = await readJsonFile<TemplateProfile>(resolveFromCwd(template.cachedProfilePath));
  await validateSchema("template-profile", profile);
  const instructions = await loadTemplateInstructions(styleId);
  const libraries = await Promise.all(style.slideLibraries.map((libraryId) => loadSlideLibrary(libraryId)));
  const registeredLayouts = new Set(profile.layouts.flatMap((layout) => [layout.id, layout.name]));
  const instructionByLayout = new Map((instructions?.layoutInstructions ?? []).map((layout) => [layout.layoutId, layout]));
  const librarySlideIds = new Set(libraries.flatMap((library) => library.slides.map((slide) => slide.slideId)));
  const slides = spec.slides.map((slide, index) =>
    complianceForSlide({
      slide,
      index,
      registeredLayouts,
      instruction: instructionByLayout.get(slide.layoutId ?? slide.layout ?? ""),
      instructionsPresent: Boolean(instructions),
      librarySlideIds
    })
  );
  const findings = slides.flatMap((slide) => slide.findings);
  const report: TemplateComplianceReport = {
    version: TEMPLATE_COMPLIANCE_REPORT_SCHEMA_VERSION,
    status: highestStatusFromFindings(findings),
    styleId,
    instructionsPath: instructions ? templateInstructionsPortablePath(styleId) : null,
    slides,
    findings
  };
  await validateSchema("template-compliance-report", report);
  const reportPath = options.outDir ? path.join(resolveFromCwd(options.outDir), "template-compliance-report.json") : null;
  if (options.writeReport && reportPath) {
    await writeJsonFile(reportPath, report);
  }
  return { report, reportPath, instructions };
}

function complianceForSlide(options: {
  slide: DeckSpecSlide;
  index: number;
  registeredLayouts: Set<string>;
  instruction?: LayoutInstruction;
  instructionsPresent: boolean;
  librarySlideIds: Set<string>;
}): TemplateComplianceSlideReport {
  const layoutId = options.slide.layoutId ?? options.slide.layout ?? "";
  const findings: SeverityFinding[] = [];
  const contentByPlaceholder = contentByPlaceholderId(options.slide.content ?? []);
  const assetPlaceholders = new Set((options.slide.assets ?? []).map((asset) => asset.placeholderId).filter(Boolean) as string[]);
  const isLibrarySlide = options.slide.source === "library" || options.slide.source === "library-pattern";
  const librarySlideRegistered = Boolean(options.slide.librarySlideId && options.librarySlideIds.has(options.slide.librarySlideId));
  const usedRegisteredLayout = options.registeredLayouts.has(layoutId) || (isLibrarySlide && librarySlideRegistered);
  if (!usedRegisteredLayout) {
    findings.push(finding("unknown-layout", "BLOCKER", options.slide, options.index, `Selected layout or library slide is not registered: ${layoutId}.`));
  }
  if (isLibrarySlide && options.slide.librarySlideId && !options.librarySlideIds.has(options.slide.librarySlideId)) {
    findings.push(
      finding("unknown-library-slide", "BLOCKER", options.slide, options.index, `Selected library slide is not registered: ${options.slide.librarySlideId}.`)
    );
  }
  if (options.instructionsPresent && !options.slide.selectionReason?.trim()) {
    findings.push(finding("missing-selection-reason", "MAJOR", options.slide, options.index, "Template instructions are present, so this slide needs a layout selectionReason."));
  }

  const instruction = options.instruction;
  const allowedPlaceholders = new Set([...(instruction?.requiredPlaceholders ?? []), ...(instruction?.optionalPlaceholders ?? [])]);
  const unknownPlaceholders = instruction
    ? [...contentByPlaceholder.keys()].filter((placeholderId) => !allowedPlaceholders.has(placeholderId))
    : [];
  for (const placeholderId of unknownPlaceholders) {
    findings.push(
      finding("unknown-placeholder", "BLOCKER", options.slide, options.index, `Placeholder ${placeholderId} is not allowed for layout ${layoutId}.`, placeholderId)
    );
  }

  const missingRequiredPlaceholders = (instruction?.requiredPlaceholders ?? []).filter((placeholderId) => {
    const content = contentByPlaceholder.get(placeholderId);
    return !content || !contentText(content).trim();
  });
  for (const placeholderId of missingRequiredPlaceholders) {
    findings.push(
      finding("missing-required-placeholder", "BLOCKER", options.slide, options.index, `Required placeholder ${placeholderId} is not filled for layout ${layoutId}.`, placeholderId)
    );
  }

  let requiredAssetsPresent = true;
  let requiredCitationsPresent = true;
  for (const [placeholderId, contract] of Object.entries(instruction?.placeholderContracts ?? {})) {
    const content = contentByPlaceholder.get(placeholderId);
    const text = content ? contentText(content) : "";
    const items = content?.items ?? (content?.value || content?.text ? [content.value ?? content.text ?? ""] : []);
    if (contract.maxCharacters !== null && text.length > contract.maxCharacters) {
      findings.push(
        finding(
          "placeholder-max-characters",
          "MAJOR",
          options.slide,
          options.index,
          `Placeholder ${placeholderId} has ${text.length} characters, exceeding ${contract.maxCharacters}.`,
          placeholderId,
          { maxCharacters: contract.maxCharacters, actualCharacters: text.length }
        )
      );
    }
    if (contract.minItems !== null && items.length < contract.minItems) {
      findings.push(
        finding("placeholder-min-items", "MAJOR", options.slide, options.index, `Placeholder ${placeholderId} has fewer than ${contract.minItems} item(s).`, placeholderId)
      );
    }
    if (contract.maxItems !== null && items.length > contract.maxItems) {
      findings.push(
        finding("placeholder-max-items", "MAJOR", options.slide, options.index, `Placeholder ${placeholderId} has more than ${contract.maxItems} item(s).`, placeholderId)
      );
    }
    if (contract.maxCharactersPerItem !== null) {
      for (const item of items) {
        const itemText = typeof item === "string" ? item : [item.label, item.text].filter(Boolean).join(": ");
        if (itemText.length > contract.maxCharactersPerItem) {
          findings.push(
            finding(
              "placeholder-item-max-characters",
              "MAJOR",
              options.slide,
              options.index,
              `Placeholder ${placeholderId} has an item longer than ${contract.maxCharactersPerItem} characters.`,
              placeholderId,
              { maxCharactersPerItem: contract.maxCharactersPerItem, actualCharacters: itemText.length }
            )
          );
        }
      }
    }
    if (contract.requiresCitations && (options.slide.citations ?? []).length === 0) {
      requiredCitationsPresent = false;
      findings.push(finding("missing-required-citation", "BLOCKER", options.slide, options.index, `Placeholder ${placeholderId} requires citations.`, placeholderId));
    }
    if (contract.requiresAsset && !assetPlaceholders.has(placeholderId)) {
      requiredAssetsPresent = false;
      findings.push(finding("missing-required-asset", "BLOCKER", options.slide, options.index, `Placeholder ${placeholderId} requires an asset.`, placeholderId));
    }
  }

  return {
    slideId: options.slide.id,
    layoutId,
    usedRegisteredLayout,
    allRequiredPlaceholdersFilled: missingRequiredPlaceholders.length === 0,
    unknownPlaceholders,
    missingRequiredPlaceholders,
    requiredAssetsPresent,
    requiredCitationsPresent,
    slideLibrarySourceId: options.slide.librarySlideId ?? null,
    findings
  };
}

function contentByPlaceholderId(content: ContentBlock[]): Map<string, ContentBlock> {
  const mapped = new Map<string, ContentBlock>();
  for (const block of content) {
    if (block.placeholderId) {
      mapped.set(block.placeholderId, block);
    }
  }
  return mapped;
}

function contentText(content: ContentBlock): string {
  return [
    content.value,
    content.text,
    ...(content.items ?? []).map((item) => (typeof item === "string" ? item : [item.label, item.text].filter(Boolean).join(": "))),
    ...Object.values(content.fields ?? {})
  ]
    .filter(Boolean)
    .join("\n");
}

function finding(
  id: string,
  severity: SeverityFinding["severity"],
  slide: DeckSpecSlide,
  slideIndex: number,
  message: string,
  objectId?: string,
  evidence?: unknown
): SeverityFinding {
  return {
    id,
    severity,
    category: "template-compliance",
    slideId: slide.id,
    slideIndex: slideIndex + 1,
    objectId,
    message,
    evidence,
    suggestedRepairIntent: "Revise the deck spec first: choose a registered layout, fill required placeholders, shorten content, or add required citations/assets."
  };
}
