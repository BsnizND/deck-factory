import { stat } from "node:fs/promises";
import { PACKAGE_MANIFEST_SCHEMA_VERSION } from "../constants.js";
import { fail } from "../errors.js";
import type { ArtifactPublishResult } from "../publishers/schemas.js";
import { validateSchema } from "../schema/validate.js";
import { pathExists, sha256File, toPortablePath, writeJsonFile } from "../util/fs.js";

export type PackageArtifactRole = "primary-deck" | "delivery-metadata" | "internal-evidence" | "internal-log";
export type PackageRetentionClass = "client-deliverable" | "delivery-control" | "approval-evidence" | "operational-log";

export interface PackageManifestArtifact {
  path: string;
  kind: "file" | "directory";
  role: PackageArtifactRole;
  retentionClass: PackageRetentionClass;
  includedInDefaultHandoff: boolean;
  required: boolean;
  description: string;
  bytes?: number;
  sha256?: string;
}

export interface PackageManifest {
  version: string;
  createdAt: string;
  runDir: string;
  handoffPolicy: {
    defaultHandoff: "deck-only";
    approvalPackageRequiresExplicitRequest: boolean;
    publicRoutesAllowed: boolean;
    publishedDeliveryVisibility?: string | null;
    publishedDeliveryExpiresAt?: string | null;
    notes: string[];
  };
  retentionPolicy: {
    finalDeck: string;
    approvalEvidence: string;
    publishedDelivery: string;
    smokeRuns: string;
  };
  artifacts: PackageManifestArtifact[];
}

export async function writePackageManifest(options: {
  outPath: string;
  runDir: string;
  deckPath: string;
  runSummaryPath: string;
  specPath: string;
  operationsPath: string;
  qaReportPath: string;
  screenshotsDir?: string;
  capabilitiesPath: string;
  powerPointFilesPath: string;
  templateComplianceReportPath: string;
  templateSecurityReportPath: string;
  runtimeProvenancePath: string;
  sourceMapPath: string;
  productQualityReportPath: string;
  publishResultPath?: string;
  publishResult?: ArtifactPublishResult | null;
}): Promise<PackageManifest> {
  const artifactSpecs: Array<Omit<PackageManifestArtifact, "path" | "kind" | "bytes" | "sha256"> & { filePath: string; kind?: "file" | "directory" }> = [
    {
      filePath: options.deckPath,
      role: "primary-deck",
      retentionClass: "client-deliverable",
      includedInDefaultHandoff: true,
      required: true,
      description: "Final PowerPoint deck approved by the Deck Factory QA gates."
    },
    {
      filePath: options.runSummaryPath,
      role: "internal-evidence",
      retentionClass: "approval-evidence",
      includedInDefaultHandoff: false,
      required: true,
      description: "Run summary with gate outcomes and artifact pointers."
    },
    {
      filePath: options.specPath,
      role: "internal-evidence",
      retentionClass: "approval-evidence",
      includedInDefaultHandoff: false,
      required: true,
      description: "Final deck specification used to render the PowerPoint."
    },
    {
      filePath: options.qaReportPath,
      role: "internal-evidence",
      retentionClass: "approval-evidence",
      includedInDefaultHandoff: false,
      required: true,
      description: "Deterministic QA and rendering report."
    },
    {
      filePath: options.productQualityReportPath,
      role: "internal-evidence",
      retentionClass: "approval-evidence",
      includedInDefaultHandoff: false,
      required: true,
      description: "Product-quality review report."
    },
    {
      filePath: options.templateComplianceReportPath,
      role: "internal-evidence",
      retentionClass: "approval-evidence",
      includedInDefaultHandoff: false,
      required: true,
      description: "Template-compliance report for layout and placeholder contracts."
    },
    {
      filePath: options.templateSecurityReportPath,
      role: "internal-evidence",
      retentionClass: "approval-evidence",
      includedInDefaultHandoff: false,
      required: true,
      description: "Template security scan report."
    },
    {
      filePath: options.runtimeProvenancePath,
      role: "internal-evidence",
      retentionClass: "approval-evidence",
      includedInDefaultHandoff: false,
      required: true,
      description: "Runtime and dependency provenance report."
    },
    {
      filePath: options.sourceMapPath,
      role: "internal-evidence",
      retentionClass: "approval-evidence",
      includedInDefaultHandoff: false,
      required: true,
      description: "Slide-level source and citation map."
    },
    {
      filePath: options.capabilitiesPath,
      role: "internal-evidence",
      retentionClass: "approval-evidence",
      includedInDefaultHandoff: false,
      required: true,
      description: "Capability manifest for optional Computer Use integration."
    },
    {
      filePath: options.powerPointFilesPath,
      role: "internal-evidence",
      retentionClass: "approval-evidence",
      includedInDefaultHandoff: false,
      required: true,
      description: "PowerPoint file-role manifest for inputs and generated output."
    },
    {
      filePath: options.operationsPath,
      role: "internal-log",
      retentionClass: "operational-log",
      includedInDefaultHandoff: false,
      required: true,
      description: "Operational render log for debugging and audit."
    }
  ];
  if (options.screenshotsDir) {
    artifactSpecs.push({
      filePath: options.screenshotsDir,
      kind: "directory",
      role: "internal-evidence",
      retentionClass: "approval-evidence",
      includedInDefaultHandoff: false,
      required: false,
      description: "Rasterized slide screenshots used by QA and agentic review."
    });
  }
  if (options.publishResultPath) {
    artifactSpecs.push({
      filePath: options.publishResultPath,
      role: "delivery-metadata",
      retentionClass: "delivery-control",
      includedInDefaultHandoff: false,
      required: false,
      description: "Tailnet delivery metadata. This file can contain the tokenized delivery URL."
    });
  }

  const artifacts: PackageManifestArtifact[] = [];
  for (const artifact of artifactSpecs) {
    const entry = await describeArtifact(artifact.filePath, artifact.kind ?? "file", artifact);
    if (entry) {
      artifacts.push(entry);
    }
  }

  const manifest: PackageManifest = {
    version: PACKAGE_MANIFEST_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    runDir: toPortablePath(options.runDir),
    handoffPolicy: {
      defaultHandoff: "deck-only",
      approvalPackageRequiresExplicitRequest: true,
      publicRoutesAllowed: false,
      publishedDeliveryVisibility: options.publishResult?.delivery.visibility ?? null,
      publishedDeliveryExpiresAt: options.publishResult?.delivery.expiresAt ?? null,
      notes: [
        "Default client handoff includes only the final deck.",
        "QA, provenance, logs, and delivery metadata are internal evidence unless explicitly requested.",
        "Do not duplicate tokenized delivery URLs into approval evidence or chat transcripts."
      ]
    },
    retentionPolicy: {
      finalDeck: "Retain as the client deliverable for the project record.",
      approvalEvidence: "Retain with the run until operator cleanup or project archive; do not send by default.",
      publishedDelivery: "Tailnet Artifact Gateway delivery links expire by their configured TTL and remain tailnet-only.",
      smokeRuns: "Smoke-test packages should use a one-hour-or-shorter gateway TTL and can be purged after proof is captured."
    },
    artifacts
  };
  await validateSchema("package-manifest", manifest);
  await writeJsonFile(options.outPath, manifest);
  return manifest;
}

async function describeArtifact(
  filePath: string,
  kind: "file" | "directory",
  metadata: Omit<PackageManifestArtifact, "path" | "kind" | "bytes" | "sha256"> & { filePath: string; kind?: "file" | "directory" }
): Promise<PackageManifestArtifact | null> {
  if (!(await pathExists(filePath))) {
    if (metadata.required) {
      fail(`Required package manifest artifact is missing: ${filePath}`);
    }
    return null;
  }
  const info = await stat(filePath);
  if (kind === "file" && !info.isFile()) {
    fail(`Expected package manifest artifact to be a file: ${filePath}`);
  }
  if (kind === "directory" && !info.isDirectory()) {
    fail(`Expected package manifest artifact to be a directory: ${filePath}`);
  }
  const entry: PackageManifestArtifact = {
    path: toPortablePath(filePath),
    kind,
    role: metadata.role,
    retentionClass: metadata.retentionClass,
    includedInDefaultHandoff: metadata.includedInDefaultHandoff,
    required: metadata.required,
    description: metadata.description
  };
  if (kind === "file" && info.isFile()) {
    entry.bytes = info.size;
    entry.sha256 = await sha256File(filePath);
  }
  return entry;
}
