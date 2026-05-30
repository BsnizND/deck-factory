import { RUN_SUMMARY_SCHEMA_VERSION } from "../constants.js";
import type { RunStatus, SeverityFinding } from "./severity.js";
import { validateSchema } from "../schema/validate.js";
import { writeJsonFile } from "../util/fs.js";

export interface RunGate {
  id: string;
  status: "pending" | "running" | "passed" | "failed" | "blocked" | "skipped";
  required: boolean;
  message?: string;
  artifactPath?: string;
}

export interface RunSummary {
  version: string;
  status: RunStatus;
  startedAt: string;
  completedAt: string | null;
  styleId: string;
  inputHandoffPath: string | null;
  inputSpecPath: string | null;
  outputDeckPath: string | null;
  slideCount: number | null;
  gates: RunGate[];
  blockerFindings: SeverityFinding[];
  repairAttempts: number;
  artifactPaths: Record<string, string | null>;
}

export function createRunSummary(options: {
  styleId: string;
  handoffPath?: string;
  specPath?: string;
}): RunSummary {
  return {
    version: RUN_SUMMARY_SCHEMA_VERSION,
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: null,
    styleId: options.styleId,
    inputHandoffPath: options.handoffPath ?? null,
    inputSpecPath: options.specPath ?? null,
    outputDeckPath: null,
    slideCount: null,
    gates: [
      "input",
      "style-resolution",
      "template-profile",
      "template-security",
      "template-instructions",
      "deck-spec",
      "template-compliance",
      "assets",
      "render",
      "package-integrity",
      "rasterization",
      "deterministic-qa",
      "agentic-review",
      "repair",
      "final-deck",
      "handoff-artifacts"
    ].map((id) => ({ id, status: "pending" as const, required: !["agentic-review"].includes(id) })),
    blockerFindings: [],
    repairAttempts: 0,
    artifactPaths: {}
  };
}

export function setGate(summary: RunSummary, id: string, status: RunGate["status"], message?: string, artifactPath?: string): void {
  const gate = summary.gates.find((item) => item.id === id);
  if (!gate) {
    summary.gates.push({ id, status, required: true, message, artifactPath });
    return;
  }
  gate.status = status;
  gate.message = message;
  gate.artifactPath = artifactPath;
}

export async function writeRunSummary(filePath: string, summary: RunSummary): Promise<void> {
  await validateSchema("run-summary", summary);
  await writeJsonFile(filePath, summary);
}
