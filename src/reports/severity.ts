export type FindingSeverity = "BLOCKER" | "MAJOR" | "MINOR" | "INFO";

export type RunStatus = "pending" | "running" | "passed" | "failed" | "blocked" | "repaired";

export interface SeverityFinding {
  id: string;
  severity: FindingSeverity;
  category: string;
  slideId?: string;
  slideIndex?: number;
  objectId?: string;
  message: string;
  evidence?: unknown;
  suggestedRepairIntent?: string;
}

export function hasSeverity(findings: SeverityFinding[], severity: FindingSeverity): boolean {
  return findings.some((finding) => finding.severity === severity);
}

export function highestStatusFromFindings(findings: SeverityFinding[]): "passed" | "warning" | "failed" {
  if (hasSeverity(findings, "BLOCKER")) {
    return "failed";
  }
  if (findings.some((finding) => finding.severity === "MAJOR" || finding.severity === "MINOR")) {
    return "warning";
  }
  return "passed";
}
