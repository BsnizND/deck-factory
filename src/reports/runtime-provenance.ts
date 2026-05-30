import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import { APP_VERSION, RUNTIME_PROVENANCE_SCHEMA_VERSION } from "../constants.js";
import { validateSchema } from "../schema/validate.js";
import type { TemplateProfile } from "../template/extract-template-profile.js";
import { writeJsonFile } from "../util/fs.js";

const execFileAsync = promisify(execFile);

export interface RuntimeProvenance {
  version: string;
  createdAt: string;
  platform: string;
  nodeVersion: string;
  packageVersion: string;
  renderer: {
    adapter: string;
    library: string;
  };
  rasterizers: Array<{ command: string; version: string | null; available: boolean }>;
  templateFonts: string[];
  detectedFonts: string[];
  fontSubstitutions: Array<Record<string, unknown>>;
}

export async function writeRuntimeProvenance(options: {
  filePath: string;
  templateProfile?: TemplateProfile | null;
}): Promise<RuntimeProvenance> {
  const rasterizers = await Promise.all(
    [
      { command: "soffice", args: ["--version"] },
      { command: "libreoffice", args: ["--version"] },
      { command: "magick", args: ["--version"] },
      { command: "gs", args: ["--version"] }
    ].map(async (candidate) => probeCommand(candidate.command, candidate.args))
  );
  const report: RuntimeProvenance = {
    version: RUNTIME_PROVENANCE_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    platform: `${os.type()} ${os.release()} ${os.arch()}`,
    nodeVersion: process.version,
    packageVersion: APP_VERSION,
    renderer: {
      adapter: "deck-factory-pptx-automizer-adapter",
      library: "pptx-automizer"
    },
    rasterizers,
    templateFonts: options.templateProfile?.themeFonts ?? [],
    detectedFonts: [],
    fontSubstitutions: []
  };
  await validateSchema("runtime-provenance", report);
  await writeJsonFile(options.filePath, report);
  return report;
}

async function probeCommand(command: string, args: string[]): Promise<{ command: string; version: string | null; available: boolean }> {
  try {
    const result = await execFileAsync(command, args, { timeout: 10_000, maxBuffer: 1024 * 1024 });
    return {
      command,
      version: [result.stdout, result.stderr].join("\n").trim().split("\n")[0] ?? null,
      available: true
    };
  } catch {
    return { command, version: null, available: false };
  }
}
