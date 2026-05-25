import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fail } from "../errors.js";
import { inspectTemplate } from "../registry/template-registry.js";
import { loadSlideLibrary } from "../registry/slide-library.js";
import { loadStylePack } from "../registry/style-pack.js";
import { validateSchema } from "../schema/validate.js";
import { readJsonFile, resolveFromCwd } from "../util/fs.js";
import type { TemplateProfile } from "../template/extract-template-profile.js";

const require = createRequire(import.meta.url);
const { Automizer, modify } = require("pptx-automizer");

interface DeckSpec {
  style: { styleId?: string };
  slides: DeckSpecSlide[];
}

interface DeckSpecSlide {
  id: string;
  source: "generated" | "library" | "library-pattern";
  layout: string;
  librarySlideId?: string;
  title: string;
  content: Array<{ type?: string; text?: string; items?: string[]; fields?: Record<string, string> }>;
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
    pres = pres.addSlide("template", layout.sourceSlide, (automizerSlide: any) => {
      automizerSlide.modifyElement("df_title", [modify.setText(slide.title)]);
      const body = slide.content
        .map((block) => block.text ?? block.items?.join("\n") ?? "")
        .filter(Boolean)
        .join("\n\n");
      if (body) {
        const bodyElement = layout.id === "title" ? "df_subtitle" : "df_body";
        automizerSlide.modifyElement(bodyElement, [modify.setText(body)]);
      }
    });
    operations.push({ slideId: slide.id, operation: "render-generated-slide", layout: layout.id });
  }

  await pres.write("deck.pptx");
  await writeFile(operationsPath, operations.map((operation) => JSON.stringify(operation)).join("\n") + "\n", "utf8");
  return { deckPath, operationsPath, slideCount: spec.slides.length };
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
