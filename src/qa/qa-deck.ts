import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import JSZip from "jszip";
import { fail } from "../errors.js";
import { validateSchema } from "../schema/validate.js";
import { assertReadableFile, ensureDir, readJsonFile, resolveFromCwd, writeJsonFile } from "../util/fs.js";

const execFileAsync = promisify(execFile);

interface DeckSpec {
  slides: unknown[];
}

export interface QaReport {
  version: string;
  renderStatus: "passed" | "failed";
  slideCountMatch: boolean;
  rasterizationStatus: "passed" | "failed" | "not-run";
  missingAssets: string[];
  textOverflowFindings: unknown[];
  clippingFindings: unknown[];
  outOfBoundsFindings: unknown[];
  overlapFindings: unknown[];
  fontSubstitutionWarnings: string[];
  contrastWarnings: unknown[];
  screenshotEvaluatorNotes: unknown[];
  status: "passed" | "failed";
}

export interface QaDeckResult {
  reportPath: string;
  report: QaReport;
}

export async function qaDeck(options: {
  deckPath: string;
  specPath: string;
  outDir: string;
  failOnError?: boolean;
}): Promise<QaDeckResult> {
  const deckPath = resolveFromCwd(options.deckPath);
  const specPath = resolveFromCwd(options.specPath);
  const outDir = resolveFromCwd(options.outDir);
  const reportPath = path.join(outDir, "qa-report.json");
  await ensureDir(outDir);

  const baseReport = emptyReport();
  let report = baseReport;
  try {
    await assertReadableFile(deckPath);
    const spec = await readJsonFile<DeckSpec>(specPath);
    await validateSchema("deck-spec", spec);
    const slideCount = await countPptxSlides(deckPath);
    const slideCountMatch = slideCount === spec.slides.length;
    report = {
      ...report,
      renderStatus: "passed",
      slideCountMatch,
      screenshotEvaluatorNotes: slideCountMatch
        ? []
        : [
            {
              type: "slide-count-mismatch",
              expected: spec.slides.length,
              actual: slideCount
            }
          ]
    };

    const rasterizer = await findRasterizer();
    if (!rasterizer) {
      report = failReport(report, {
        type: "missing-prerequisite",
        prerequisite: "PPTX rasterizer",
        detail: "Install LibreOffice and expose either soffice or libreoffice on PATH to enable screenshot QA."
      });
    } else {
      const rasterDir = path.join(outDir, "screenshots");
      await ensureDir(rasterDir);
      await execFileAsync(
        rasterizer,
        ["--headless", "--convert-to", "pdf", "--outdir", rasterDir, deckPath],
        { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 }
      );
      report = {
        ...report,
        rasterizationStatus: "passed"
      };
    }
  } catch (error) {
    report = failReport(report, {
      type: "qa-exception",
      detail: (error as Error).message
    });
  }

  report = {
    ...report,
    status: report.renderStatus === "passed" && report.slideCountMatch && report.rasterizationStatus === "passed" ? "passed" : "failed"
  };
  await validateSchema("qa-report", report);
  await writeJsonFile(reportPath, report);
  if (report.status !== "passed" && options.failOnError !== false) {
    fail(`Deck QA failed. See report: ${reportPath}`);
  }
  return { reportPath, report };
}

export async function countPptxSlides(deckPath: string): Promise<number> {
  const bytes = await readFile(deckPath);
  const zip = await JSZip.loadAsync(bytes);
  const presentationXml = await zip.file("ppt/presentation.xml")?.async("text");
  if (!presentationXml) {
    fail(`PPTX is missing ppt/presentation.xml: ${deckPath}`);
  }
  return [...presentationXml.matchAll(/<p:sldId\b/g)].length;
}

async function findRasterizer(): Promise<string | null> {
  for (const command of ["soffice", "libreoffice"]) {
    try {
      await execFileAsync(command, ["--version"], { timeout: 10_000 });
      return command;
    } catch {
      // Keep looking for a supported rasterizer.
    }
  }
  return null;
}

function emptyReport(): QaReport {
  return {
    version: "deck-factory.qa-report.v1",
    renderStatus: "failed",
    slideCountMatch: false,
    rasterizationStatus: "not-run",
    missingAssets: [],
    textOverflowFindings: [],
    clippingFindings: [],
    outOfBoundsFindings: [],
    overlapFindings: [],
    fontSubstitutionWarnings: [],
    contrastWarnings: [],
    screenshotEvaluatorNotes: [],
    status: "failed"
  };
}

function failReport(report: QaReport, note: unknown): QaReport {
  return {
    ...report,
    rasterizationStatus: report.rasterizationStatus === "not-run" ? "failed" : report.rasterizationStatus,
    screenshotEvaluatorNotes: [...report.screenshotEvaluatorNotes, note],
    status: "failed"
  };
}
