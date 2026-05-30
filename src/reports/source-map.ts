import { SOURCE_MAP_SCHEMA_VERSION } from "../constants.js";
import { validateSchema } from "../schema/validate.js";
import { readJsonFile, resolveFromCwd, writeJsonFile } from "../util/fs.js";

interface DeckSpec {
  style: { styleId?: string };
  slides: Array<{
    id: string;
    layout?: string;
    layoutId?: string;
    title?: string;
    actionTitle?: string;
    selectionReason?: string;
    citations?: string[];
    assets?: Array<Record<string, unknown>>;
    sourceSections?: string[];
    librarySlideId?: string;
  }>;
}

export async function writeSourceMap(options: {
  specPath: string;
  outPath: string;
}): Promise<unknown> {
  const spec = await readJsonFile<DeckSpec>(resolveFromCwd(options.specPath));
  const sourceMap = {
    version: SOURCE_MAP_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    styleId: spec.style.styleId ?? "",
    slides: spec.slides.map((slide) => ({
      slideId: slide.id,
      title: slide.actionTitle ?? slide.title ?? "",
      templateLayoutId: slide.layoutId ?? slide.layout ?? "",
      layoutSelectionReason: slide.selectionReason ?? null,
      citations: slide.citations ?? [],
      assets: slide.assets ?? [],
      sourceSections: slide.sourceSections ?? [],
      slideLibrarySourceId: slide.librarySlideId ?? null
    }))
  };
  await validateSchema("source-map", sourceMap);
  await writeJsonFile(options.outPath, sourceMap);
  return sourceMap;
}
