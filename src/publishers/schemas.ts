export type PublishMode = "none" | "tailnet-gateway";
export type PublishVisibility = "tailnet" | "local";

export interface ArtifactPublishOptions {
  mode: PublishMode;
  required: boolean;
  ttl: string;
  visibility: PublishVisibility;
  gatewayCommand: string;
}

export interface GatewayPublishResult {
  version: "tailnet-artifact-gateway.publish-result.v1";
  artifactId: string;
  url: string;
  downloadPath?: string;
  filename: string;
  contentType?: string;
  bytes?: number;
  sha256?: string;
  createdAt?: string;
  expiresAt?: string;
  visibility: PublishVisibility;
  requiresTailnet?: boolean;
  tokenRequired?: boolean;
}

export interface ArtifactPublishResult {
  version: "deck-factory.publish-result.v1";
  status: "published";
  createdAt: string;
  publisher: {
    id: "tailnet-artifact-gateway";
    command: string;
  };
  artifact: {
    kind: "deck" | "approval-bundle" | "qa-evidence";
    path: string;
    filename: string;
    contentType?: string;
    bytes?: number;
    sha256?: string;
  };
  delivery: {
    url: string;
    visibility: PublishVisibility;
    expiresAt?: string;
    requiresTailnet?: boolean;
    tokenRequired?: boolean;
  };
  raw: GatewayPublishResult;
}

export function parsePublishMode(value: string | undefined): PublishMode {
  const mode = value ?? "none";
  if (mode !== "none" && mode !== "tailnet-gateway") {
    throw new Error(`Invalid publish mode: ${mode}. Expected none or tailnet-gateway.`);
  }
  return mode;
}

export function parsePublishVisibility(value: string | undefined): PublishVisibility {
  const visibility = value ?? "tailnet";
  if (visibility !== "tailnet" && visibility !== "local") {
    throw new Error(`Invalid publish visibility: ${visibility}. Expected tailnet or local.`);
  }
  return visibility;
}

export function parsePublishRequired(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  if (/^(1|true|yes)$/i.test(value)) {
    return true;
  }
  if (/^(0|false|no)$/i.test(value)) {
    return false;
  }
  throw new Error(`Invalid publish required value: ${value}. Expected true or false.`);
}

export function validateGatewayPublishResult(value: unknown): GatewayPublishResult {
  if (!value || typeof value !== "object") {
    throw new Error("artifact-gateway returned non-object JSON.");
  }
  const record = value as Record<string, unknown>;
  if (record.version !== "tailnet-artifact-gateway.publish-result.v1") {
    throw new Error("artifact-gateway returned an unexpected result version.");
  }
  if (typeof record.artifactId !== "string" || !record.artifactId.startsWith("art_")) {
    throw new Error("artifact-gateway result is missing artifactId.");
  }
  if (typeof record.url !== "string" || !/^https?:\/\//.test(record.url)) {
    throw new Error("artifact-gateway result is missing a valid URL.");
  }
  if (typeof record.filename !== "string" || record.filename.length === 0) {
    throw new Error("artifact-gateway result is missing filename.");
  }
  const visibility = parsePublishVisibility(typeof record.visibility === "string" ? record.visibility : undefined);
  return {
    version: "tailnet-artifact-gateway.publish-result.v1",
    artifactId: record.artifactId,
    url: record.url,
    downloadPath: typeof record.downloadPath === "string" ? record.downloadPath : undefined,
    filename: record.filename,
    contentType: typeof record.contentType === "string" ? record.contentType : undefined,
    bytes: typeof record.bytes === "number" ? record.bytes : undefined,
    sha256: typeof record.sha256 === "string" ? record.sha256 : undefined,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined,
    expiresAt: typeof record.expiresAt === "string" ? record.expiresAt : undefined,
    visibility,
    requiresTailnet: typeof record.requiresTailnet === "boolean" ? record.requiresTailnet : undefined,
    tokenRequired: typeof record.tokenRequired === "boolean" ? record.tokenRequired : undefined
  };
}
