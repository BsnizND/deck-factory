import { PRODUCT_QUALITY_REPORT_SCHEMA_VERSION } from "../constants.js";
import { validateSchema } from "../schema/validate.js";
import { highestStatusFromFindings, type SeverityFinding } from "../reports/severity.js";
import { readJsonFile, resolveFromCwd, writeJsonFile } from "../util/fs.js";

export type ProductQualityMode = "off" | "warn" | "strict";

export interface ProductQualityReport {
  version: string;
  mode: ProductQualityMode;
  status: "passed" | "warning" | "failed" | "skipped";
  findings: SeverityFinding[];
  metrics: Record<string, unknown>;
}

interface DeckSpec {
  deck: {
    title?: string;
    objective?: string;
    speakerNotes?: boolean;
  };
  slides: Array<{
    id: string;
    source?: string;
    title?: string;
    actionTitle?: string;
    purpose?: string;
    speakerNotes?: string;
    citations?: string[];
    sourceSections?: string[];
    content?: unknown[];
    assets?: unknown[];
  }>;
}

export function resolveProductQualityMode(value: string | undefined): ProductQualityMode {
  const normalized = (value ?? process.env.DECK_FACTORY_PRODUCT_QUALITY ?? "warn").trim().toLowerCase();
  if (normalized === "off" || normalized === "false" || normalized === "0") {
    return "off";
  }
  if (normalized === "warn" || normalized === "warning" || normalized === "") {
    return "warn";
  }
  if (normalized === "strict" || normalized === "required" || normalized === "fail") {
    return "strict";
  }
  throw new Error(`Invalid product quality mode: ${value}. Expected off, warn, or strict.`);
}

export async function writeProductQualityReport(options: {
  specPath: string;
  outPath: string;
  mode: ProductQualityMode;
}): Promise<ProductQualityReport> {
  const spec = await readJsonFile<DeckSpec>(resolveFromCwd(options.specPath));
  const report = createProductQualityReport(spec, options.mode);
  await validateSchema("product-quality-report", report);
  await writeJsonFile(options.outPath, report);
  return report;
}

export function createProductQualityReport(spec: DeckSpec, mode: ProductQualityMode): ProductQualityReport {
  if (mode === "off") {
    return {
      version: PRODUCT_QUALITY_REPORT_SCHEMA_VERSION,
      mode,
      status: "skipped",
      findings: [],
      metrics: {}
    };
  }

  const findings = productQualityFindings(spec);
  const baseStatus = highestStatusFromFindings(findings);
  const status =
    mode === "strict"
      ? baseStatus
      : baseStatus === "passed"
        ? "passed"
        : "warning";
  return {
    version: PRODUCT_QUALITY_REPORT_SCHEMA_VERSION,
    mode,
    status,
    findings,
    metrics: productQualityMetrics(spec)
  };
}

function productQualityFindings(spec: DeckSpec): SeverityFinding[] {
  const findings: SeverityFinding[] = [];
  const generatedSlides = spec.slides.filter((slide) => slide.source !== "library");
  const citationCount = spec.slides.reduce((count, slide) => count + (slide.citations?.length ?? 0), 0);
  const sourceSectionCount = new Set(spec.slides.flatMap((slide) => slide.sourceSections ?? [])).size;
  const notesCount = spec.slides.filter((slide) => Boolean(slide.speakerNotes?.trim())).length;
  const assetCount = spec.slides.reduce((count, slide) => count + (Array.isArray(slide.assets) ? slide.assets.length : 0), 0);
  const text = collectText(spec).toLowerCase();

  if (containsFixtureCaveat(text)) {
    findings.push({
      id: "visible-fixture-caveat",
      severity: "BLOCKER",
      category: "product-quality",
      message: "Deck contains visible sample-fixture or not-live-research caveats and cannot be treated as a final client package.",
      suggestedRepairIntent: "Use a real approved research handoff and remove fixture-only caveats from final client-facing slides."
    });
  }
  if (citationCount === 0) {
    findings.push({
      id: "missing-citations",
      severity: "BLOCKER",
      category: "product-quality",
      message: "Deck has zero citations across all slides.",
      suggestedRepairIntent: "Add cited source lineage for material factual claims before final delivery."
    });
  }
  if (sourceSectionCount === 0) {
    findings.push({
      id: "missing-source-sections",
      severity: "MAJOR",
      category: "product-quality",
      message: "Deck does not map generated slides to source sections.",
      suggestedRepairIntent: "Carry source section ids from the upstream research handoff into generated slides."
    });
  }
  if (generatedSlides.length > 0 && averageSlideContentItems(generatedSlides) < 2) {
    findings.push({
      id: "thin-slide-content",
      severity: "MAJOR",
      category: "product-quality",
      message: "Generated slides are too thin for a client-ready narrative.",
      suggestedRepairIntent: "Add stronger slide-level evidence, implications, and decision-oriented synthesis."
    });
  }
  if (spec.deck.speakerNotes && notesCount < spec.slides.length) {
    findings.push({
      id: "speaker-notes-missing",
      severity: "MAJOR",
      category: "product-quality",
      message: "Speaker notes were requested but at least one slide has no speaker notes.",
      suggestedRepairIntent: "Add speaker notes to every slide or explicitly waive the speaker-notes requirement."
    });
  }
  if (assetCount === 0 && generatedSlides.length >= 5) {
    findings.push({
      id: "missing-exhibits",
      severity: "MAJOR",
      category: "product-quality",
      message: "Deck has no chart, table, visual, or asset references despite multiple generated slides.",
      suggestedRepairIntent: "Add editable evidence exhibits where the brief calls for charts, tables, or structured proof."
    });
  }

  return findings;
}

function productQualityMetrics(spec: DeckSpec): Record<string, unknown> {
  return {
    slideCount: spec.slides.length,
    generatedSlideCount: spec.slides.filter((slide) => slide.source !== "library").length,
    citationCount: spec.slides.reduce((count, slide) => count + (slide.citations?.length ?? 0), 0),
    sourceSectionCount: new Set(spec.slides.flatMap((slide) => slide.sourceSections ?? [])).size,
    speakerNotesRequested: Boolean(spec.deck.speakerNotes),
    slidesWithSpeakerNotes: spec.slides.filter((slide) => Boolean(slide.speakerNotes?.trim())).length,
    assetReferenceCount: spec.slides.reduce((count, slide) => count + (Array.isArray(slide.assets) ? slide.assets.length : 0), 0)
  };
}

function collectText(spec: DeckSpec): string {
  return [
    spec.deck.title,
    spec.deck.objective,
    ...spec.slides.flatMap((slide) => [slide.title, slide.actionTitle, slide.purpose, JSON.stringify(slide.content ?? [])])
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
}

function containsFixtureCaveat(text: string): boolean {
  return [
    "sample fixture",
    "not live research",
    "not a live research claim",
    "not decision-grade",
    "before treating this as decision-grade"
  ].some((needle) => text.includes(needle));
}

function averageSlideContentItems(slides: Array<{ content?: unknown[] }>): number {
  if (slides.length === 0) {
    return 0;
  }
  const total = slides.reduce((count, slide) => count + (Array.isArray(slide.content) ? slide.content.length : 0), 0);
  return total / slides.length;
}
