import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fail } from "../errors.js";
import { normalizePowerPointPackage } from "../powerpoint/pptx-package.js";
import { inspectTemplate } from "../registry/template-registry.js";
import { loadSlideLibrary } from "../registry/slide-library.js";
import { loadStylePack } from "../registry/style-pack.js";
import { validateSchema } from "../schema/validate.js";
import { readJsonFile, resolveFromCwd } from "../util/fs.js";
import type { TemplateProfile } from "../template/extract-template-profile.js";

const require = createRequire(import.meta.url);
const { Automizer, modify } = require("pptx-automizer");

interface DeckSpec {
  deck?: { audience?: string };
  style: { styleId?: string };
  slides: DeckSpecSlide[];
}

interface DeckSpecSlide {
  id: string;
  source: "generated" | "library" | "library-pattern";
  layout: string;
  librarySlideId?: string;
  title: string;
  actionTitle?: string;
  content: Array<{
    type?: string;
    placeholderId?: string;
    value?: string;
    heading?: string;
    text?: string;
    items?: Array<string | { label?: string; text?: string }>;
    columns?: Array<{ heading?: string; items?: string[]; text?: string }>;
    fields?: Record<string, string>;
  }>;
}

export interface BuildDeckResult {
  deckPath: string;
  operationsPath: string;
  slideCount: number;
}

export async function buildDeck(options: { specPath: string; outDir: string }): Promise<BuildDeckResult> {
  const specPath = resolveFromCwd(options.specPath);
  const outDir = resolveFromCwd(options.outDir);
  const spec = await readJsonFile<DeckSpec>(specPath);
  await validateSchema("deck-spec", spec);
  const styleId = spec.style.styleId;
  if (!styleId) {
    fail("Deck spec is missing style.styleId.");
  }
  const style = await loadStylePack(styleId);
  const template = await inspectTemplate(style.templateId);
  const profile = await readJsonFile<TemplateProfile>(resolveFromCwd(template.cachedProfilePath));
  await validateSchema("template-profile", profile);
  const library = style.slideLibraries.length > 0 ? await loadSlideLibrary(style.slideLibraries[0]) : null;
  await mkdir(outDir, { recursive: true });
  const deckPath = path.join(outDir, "deck.pptx");
  const operationsPath = path.join(outDir, "operations.jsonl");
  const outputDir = outDir;

  const automizer = new Automizer({
    templateDir: process.cwd(),
    outputDir,
    removeExistingSlides: true,
    autoImportSlideMasters: true,
    cleanup: false,
    verbosity: 0
  });
  const templatePath = resolveFromCwd(template.sourceTemplateDeckPath);
  let pres = automizer.loadRoot(templatePath).load(templatePath, "template");
  if (library) {
    pres = pres.load(resolveFromCwd(library.sourceLibraryDeckPath), "library");
  }

  const operations: unknown[] = [];
  for (const slide of spec.slides) {
    if (slide.source === "library" || slide.source === "library-pattern") {
      if (!library) {
        fail(`Slide ${slide.id} requested library source but style ${styleId} has no registered slide library.`);
      }
      const librarySlide = library.slides.find((entry) => entry.slideId === slide.librarySlideId);
      if (!librarySlide) {
        fail(`Library slide is not registered for style ${styleId}: ${slide.librarySlideId ?? "(missing id)"}`);
      }
      const fieldValues = fieldValuesForSlide(slide);
      for (const requiredField of librarySlide.requiredFields) {
        if (!fieldValues[requiredField]) {
          fail(`Slide ${slide.id} is missing required field ${requiredField} for library slide ${librarySlide.slideId}.`);
        }
      }
      if (librarySlide.requiredFields.length > 0 || Object.keys(fieldValues).length > 0) {
        pres = pres.addSlide("library", librarySlide.sourceSlideNumber, async (automizerSlide: any) => {
          const replacements = Object.entries(fieldValues).map(([replace, text]) => ({ replace, by: { text } }));
          const elements = await automizerSlide.getAllTextElementIds();
          for (const element of elements) {
            automizerSlide.modifyElement(element, [modify.replaceText(replacements)]);
          }
        });
        operations.push({
          slideId: slide.id,
          operation: "populate-library-slide",
          librarySlideId: librarySlide.slideId,
          fields: Object.keys(fieldValues).sort()
        });
      } else {
        pres = pres.addSlide("library", librarySlide.sourceSlideNumber);
        operations.push({ slideId: slide.id, operation: "copy-library-slide", librarySlideId: librarySlide.slideId });
      }
      continue;
    }

    const layout = profile.layouts.find((entry) => entry.id === slide.layout || entry.name === slide.layout);
    if (!layout?.sourceSlide) {
      fail(`Unknown or unrenderable layout for slide ${slide.id}: ${slide.layout}`);
    }
    pres = pres.addSlide("template", layout.sourceSlide, async (automizerSlide: any) => {
      const generatedText = generatedTextForSlide(slide);
      const replacementValues: Record<string, string> = {
        title: slide.title,
        audience: spec.deck?.audience ?? "",
        actionTitle: slide.actionTitle ?? slide.title,
        action_title: slide.actionTitle ?? slide.title,
        subtitle: generatedText.placeholders.subtitle ?? generatedText.body,
        context: generatedText.placeholders.context ?? "",
        body: generatedText.placeholders.body ?? generatedText.body,
        left_column: generatedText.leftColumn,
        right_column: generatedText.rightColumn,
        ...generatedText.placeholders
      };
      const replacements = Object.entries(replacementValues).map(([replace, text]) => ({
        replace: `{{${replace}}}`,
        by: { text }
      }));
      const elements = await automizerSlide.getAllTextElementIds();
      for (const element of elements) {
        automizerSlide.modifyElement(element, [modify.replaceText(replacements)]);
      }
      automizerSlide.modifyElement("df_title", [modify.setText(slide.title)]);
      const body = bodyTextForLayout(layout.id, generatedText, spec.deck?.audience);
      if (body) {
        const bodyElement = layout.id === "title" ? "df_subtitle" : "df_body";
        automizerSlide.modifyElement(bodyElement, [modify.setText(body)]);
      }
    });
    operations.push({ slideId: slide.id, operation: "render-generated-slide", layout: layout.id });
  }

  await pres.write("deck.pptx");
  await normalizePowerPointPackage(deckPath);
  await writeFile(operationsPath, operations.map((operation) => JSON.stringify(operation)).join("\n") + "\n", "utf8");
  return { deckPath, operationsPath, slideCount: spec.slides.length };
}

function generatedTextForSlide(slide: DeckSpecSlide): {
  body: string;
  leftColumn: string;
  rightColumn: string;
  placeholders: Record<string, string>;
} {
  const bodyParts: string[] = [];
  const leftParts: string[] = [];
  const rightParts: string[] = [];
  let leftColumn = "";
  let rightColumn = "";
  const placeholders: Record<string, string> = {};
  const columnBlocks = (slide.content ?? []).filter((block) => block.type === "column");
  if (columnBlocks.length > 0) {
    const formattedColumns = columnBlocks.map(formatColumn).filter(Boolean);
    leftColumn = formattedColumns[0] ?? "";
    rightColumn = formattedColumns[1] ?? "";
    bodyParts.push(formattedColumns.join("\n\n"));
    return {
      body: bodyParts.filter(Boolean).join("\n\n"),
      leftColumn,
      rightColumn,
      placeholders
    };
  }
  for (const block of slide.content ?? []) {
    if (block.placeholderId) {
      const placeholderText = formatBlockText({ ...block, text: block.value ?? block.text });
      if (placeholderText.trim()) {
        placeholders[block.placeholderId] = placeholderText;
        if (block.placeholderId === "left" || block.placeholderId.startsWith("left_") || block.placeholderId.startsWith("left-")) {
          leftParts.push(placeholderText);
          leftColumn = leftParts.join("\n");
          placeholders.left_column = leftColumn;
          continue;
        }
        if (block.placeholderId === "right" || block.placeholderId.startsWith("right_") || block.placeholderId.startsWith("right-")) {
          rightParts.push(placeholderText);
          rightColumn = rightParts.join("\n");
          placeholders.right_column = rightColumn;
          continue;
        }
        if (!["title", "headline", "subtitle", "context"].includes(block.placeholderId)) {
          bodyParts.push(formatPlaceholderBlock(block.placeholderId, placeholderText));
        }
      }
      continue;
    }
    if (block.columns && block.columns.length > 0) {
      const formattedColumns = block.columns.map(formatColumn).filter(Boolean);
      if (!leftColumn && formattedColumns[0]) {
        leftColumn = formattedColumns[0];
      }
      if (!rightColumn && formattedColumns[1]) {
        rightColumn = formattedColumns[1];
      }
      bodyParts.push(formattedColumns.join("\n\n"));
      continue;
    }
    const text = formatBlockText(block);
    if (text.trim()) {
      bodyParts.push(text);
    }
  }
  return {
    body: bodyParts.filter(Boolean).join("\n\n"),
    leftColumn,
    rightColumn,
    placeholders
  };
}

function formatPlaceholderBlock(placeholderId: string, text: string): string {
  if (placeholderId === "body") {
    return text;
  }
  return text;
}

function bodyTextForLayout(
  layoutId: string,
  generatedText: ReturnType<typeof generatedTextForSlide>,
  audience?: string
): string {
  if (layoutId !== "title") {
    const columnBody = [generatedText.leftColumn, generatedText.rightColumn].filter((part) => part.trim()).join("\n\n");
    return (generatedText.placeholders.body ?? generatedText.body) || columnBody;
  }
  return [
    audience ? `Prepared for ${audience}` : "",
    generatedText.placeholders.subtitle,
    generatedText.placeholders.context,
    generatedText.placeholders.body ?? generatedText.body
  ]
    .filter((part): part is string => Boolean(part?.trim()))
    .join("\n");
}

function formatColumn(column: { heading?: string; items?: Array<string | { label?: string; text?: string }>; text?: string }): string {
  const parts = [column.heading, column.text, formatItems(column.items)].filter((part): part is string => Boolean(part?.trim()));
  return parts.join("\n");
}

function formatBlockText(block: { heading?: string; text?: string; items?: Array<string | { label?: string; text?: string }> }): string {
  return [block.heading, block.text, formatItems(block.items)]
    .filter((part): part is string => Boolean(part?.trim()))
    .join("\n");
}

function formatItems(items?: Array<string | { label?: string; text?: string }>): string | undefined {
  if (!items) {
    return undefined;
  }
  return items
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      return [item.label, item.text].filter(Boolean).join(": ");
    })
    .filter(Boolean)
    .join("\n");
}

function fieldValuesForSlide(slide: DeckSpecSlide): Record<string, string> {
  const values: Record<string, string> = {};
  for (const block of slide.content ?? []) {
    for (const [key, value] of Object.entries(block.fields ?? {})) {
      if (typeof value === "string" && value.trim()) {
        values[key] = value;
      }
    }
  }
  return values;
}
