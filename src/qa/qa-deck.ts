import { execFile } from "node:child_process";
import { readdir, readFile, rm, rename, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import JSZip from "jszip";
import { fail } from "../errors.js";
import { inspectPowerPointPackage } from "../powerpoint/pptx-package.js";
import { validateSchema } from "../schema/validate.js";
import { assertReadableFile, ensureDir, readJsonFile, resolveFromCwd, writeJsonFile } from "../util/fs.js";

const execFileAsync = promisify(execFile);

interface DeckSpec {
  slides: Array<{
    id?: string;
    source?: string;
    layout?: string;
    title?: string;
    content?: Array<{ text?: string; items?: string[] }>;
  }>;
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
  screenshotsDir: string;
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
  const screenshotsDir = path.join(outDir, "screenshots");
  await ensureDir(outDir);

  const baseReport = emptyReport();
  let report = baseReport;
  try {
    await assertReadableFile(deckPath);
    const spec = await readJsonFile<DeckSpec>(specPath);
    await validateSchema("deck-spec", spec);
    const slideCount = await countPptxSlides(deckPath);
    const slideCountMatch = slideCount === spec.slides.length;
    const packageIssues = await inspectPowerPointPackage(deckPath);
    const textOverflowFindings = deterministicTextOverflowFindings(spec);
    report = {
      ...report,
      renderStatus: packageIssues.length === 0 ? "passed" : "failed",
      slideCountMatch,
      textOverflowFindings,
      screenshotEvaluatorNotes: [
        ...(slideCountMatch
          ? []
          : [
              {
                type: "slide-count-mismatch",
                expected: spec.slides.length,
                actual: slideCount
              }
            ]),
        ...packageIssues.map((issue) => ({
          ...issue,
          type: `powerpoint-package-${issue.type}`
        }))
      ]
    };

    const rasterizer = await findRasterizerToolchain();
    if (!rasterizer.ok) {
      report = failReport(report, {
        type: "missing-prerequisite",
        prerequisite: rasterizer.missing.join(", "),
        detail: rasterizer.detail
      });
    } else {
      const screenshots = await rasterizePptx({
        deckPath,
        outDir: screenshotsDir,
        slideCount,
        sofficeCommand: rasterizer.sofficeCommand,
        magickCommand: rasterizer.magickCommand
      });
      report = {
        ...report,
        rasterizationStatus: "passed",
        screenshotEvaluatorNotes: [
          ...report.screenshotEvaluatorNotes,
          {
            type: "rasterization",
            renderer: "libreoffice-pdf-imagemagick",
            screenshotsDir,
            slideImages: screenshots
          }
        ]
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
    status:
      report.renderStatus === "passed" &&
      report.slideCountMatch &&
      report.rasterizationStatus === "passed" &&
      !hasBlockingFindings(report)
        ? "passed"
        : "failed"
  };
  await validateSchema("qa-report", report);
  await writeJsonFile(reportPath, report);
  if (report.status !== "passed" && options.failOnError !== false) {
    fail(`Deck QA failed. See report: ${reportPath}`);
  }
  return { reportPath, report, screenshotsDir };
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

interface RasterizerToolchain {
  ok: true;
  sofficeCommand: string;
  magickCommand: string;
}

interface MissingRasterizerToolchain {
  ok: false;
  missing: string[];
  detail: string;
}

async function findRasterizerToolchain(): Promise<RasterizerToolchain | MissingRasterizerToolchain> {
  const missing: string[] = [];
  const sofficeCommand = await firstWorkingCommand([
    { command: "soffice", args: ["--version"] },
    { command: "libreoffice", args: ["--version"] }
  ]);
  if (!sofficeCommand) {
    missing.push("LibreOffice soffice/libreoffice");
  }
  const magickCommand = await firstWorkingCommand([{ command: "magick", args: ["--version"] }]);
  if (!magickCommand) {
    missing.push("ImageMagick magick");
  }
  const ghostscriptCommand = await firstWorkingCommand([{ command: "gs", args: ["--version"] }]);
  if (!ghostscriptCommand) {
    missing.push("Ghostscript gs");
  }
  if (!sofficeCommand || !magickCommand || !ghostscriptCommand) {
    return {
      ok: false,
      missing,
      detail:
        "Screenshot QA requires LibreOffice to convert PPTX to PDF, plus ImageMagick and Ghostscript to rasterize PDF pages to PNG."
    };
  }
  return { ok: true, sofficeCommand, magickCommand };
}

async function firstWorkingCommand(candidates: Array<{ command: string; args: string[] }>): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate.command, candidate.args, { timeout: 10_000 });
      return candidate.command;
    } catch {
      // Keep looking for a supported command.
    }
  }
  return null;
}

async function rasterizePptx(options: {
  deckPath: string;
  outDir: string;
  slideCount: number;
  sofficeCommand: string;
  magickCommand: string;
}): Promise<string[]> {
  await rm(options.outDir, { recursive: true, force: true });
  await ensureDir(options.outDir);
  const pdfDir = path.join(options.outDir, "_pdf");
  const libreOfficeProfileDir = path.join(options.outDir, "_lo-profile");
  await ensureDir(pdfDir);
  await ensureDir(libreOfficeProfileDir);
  const libreOfficeProfileUrl = pathToFileURL(libreOfficeProfileDir).href;
  const pdfResult = await execFileAsync(
    options.sofficeCommand,
    [`-env:UserInstallation=${libreOfficeProfileUrl}`, "--headless", "--convert-to", "pdf", "--outdir", pdfDir, options.deckPath],
    { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 }
  );
  const pdfPath = path.join(pdfDir, `${path.basename(options.deckPath, path.extname(options.deckPath))}.pdf`);
  try {
    await assertReadableFile(pdfPath);
  } catch {
    fail(`LibreOffice did not create expected PDF: ${pdfPath}. stdout: ${pdfResult.stdout.trim()} stderr: ${pdfResult.stderr.trim()}`);
  }
  await execFileAsync(
    options.magickCommand,
    ["-density", "144", pdfPath, path.join(options.outDir, "page-%03d.png")],
    { timeout: 120_000, maxBuffer: 20 * 1024 * 1024 }
  );
  const generated = (await readdir(options.outDir))
    .filter((fileName) => /^page-\d+\.png$/.test(fileName))
    .sort();
  if (generated.length !== options.slideCount) {
    fail(`Rasterized ${generated.length} slide image(s), expected ${options.slideCount}.`);
  }
  const normalizedPaths: string[] = [];
  for (const [index, fileName] of generated.entries()) {
    const sourcePath = path.join(options.outDir, fileName);
    const targetPath = path.join(options.outDir, `slide-${String(index + 1).padStart(3, "0")}.png`);
    if (sourcePath !== targetPath) {
      await rename(sourcePath, targetPath);
    }
    const info = await stat(targetPath);
    if (info.size === 0) {
      fail(`Rasterized slide image is empty: ${targetPath}`);
    }
    normalizedPaths.push(targetPath);
  }
  return normalizedPaths;
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

function deterministicTextOverflowFindings(spec: DeckSpec): unknown[] {
  const findings: unknown[] = [];
  for (const slide of spec.slides) {
    if (slide.source === "library") {
      continue;
    }
    const body = bodyTextForSlide(slide);
    const limit = slide.layout === "title" ? 260 : 700;
    if (body.length > limit) {
      findings.push({
        type: "text-length-overflow",
        slideId: slide.id ?? "unknown",
        layout: slide.layout ?? "unknown",
        characterCount: body.length,
        maxCharacters: limit,
        message: `Slide body content is too long for the v0 ${slide.layout ?? "unknown"} layout. Shorten, split, or move detail to notes.`
      });
    }
    for (const block of slide.content ?? []) {
      for (const item of block.items ?? []) {
        if (item.length > 180) {
          findings.push({
            type: "long-bullet-overflow",
            slideId: slide.id ?? "unknown",
            characterCount: item.length,
            maxCharacters: 180,
            message: "One bullet is too long for reliable PowerPoint layout. Shorten it or split it into multiple bullets."
          });
        }
      }
    }
  }
  return findings;
}

function bodyTextForSlide(slide: DeckSpec["slides"][number]): string {
  return (slide.content ?? [])
    .map((block) => block.text ?? block.items?.join("\n") ?? "")
    .filter(Boolean)
    .join("\n\n");
}

function hasBlockingFindings(report: QaReport): boolean {
  return (
    report.missingAssets.length > 0 ||
    report.textOverflowFindings.length > 0 ||
    report.clippingFindings.length > 0 ||
    report.outOfBoundsFindings.length > 0 ||
    report.overlapFindings.length > 0 ||
    report.contrastWarnings.length > 0
  );
}

function failReport(report: QaReport, note: unknown): QaReport {
  return {
    ...report,
    rasterizationStatus: report.rasterizationStatus === "not-run" ? "failed" : report.rasterizationStatus,
    screenshotEvaluatorNotes: [...report.screenshotEvaluatorNotes, note],
    status: "failed"
  };
}
