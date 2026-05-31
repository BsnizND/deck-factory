import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fail } from "../errors.js";
import { buildCommandInvocation } from "../util/command.js";
import { sha256File, toPortablePath, writeJsonFile } from "../util/fs.js";
import { validateGatewayPublishResult, type ArtifactPublishOptions, type ArtifactPublishResult } from "./schemas.js";

const execFileAsync = promisify(execFile);

export async function publishWithTailnetGateway(options: {
  filePath: string;
  runDir: string;
  artifactKind: "deck" | "approval-bundle" | "qa-evidence";
  publishOptions: ArtifactPublishOptions;
}): Promise<ArtifactPublishResult> {
  const argv = [
    "publish",
    "--file",
    options.filePath,
    "--ttl",
    options.publishOptions.ttl,
    "--visibility",
    options.publishOptions.visibility,
    "--source",
    "deck-factory",
    "--json"
  ];

  let stdout: string;
  try {
    const invocation = buildCommandInvocation(options.publishOptions.gatewayCommand, argv);
    ({ stdout } = await execFileAsync(invocation.command, invocation.args, {
      maxBuffer: 1024 * 1024,
      timeout: 120_000
    }));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`artifact-gateway publish failed: ${detail}`);
  }

  const parsed = parseGatewayJson(stdout);
  const raw = validateGatewayPublishResult(parsed);
  const result: ArtifactPublishResult = {
    version: "deck-factory.publish-result.v1",
    status: "published",
    createdAt: new Date().toISOString(),
    publisher: {
      id: "tailnet-artifact-gateway",
      command: options.publishOptions.gatewayCommand
    },
    artifact: {
      kind: options.artifactKind,
      path: toPortablePath(options.filePath),
      filename: raw.filename,
      contentType: raw.contentType,
      bytes: raw.bytes,
      sha256: raw.sha256 ?? (await sha256File(options.filePath))
    },
    delivery: {
      url: raw.url,
      visibility: raw.visibility,
      expiresAt: raw.expiresAt,
      requiresTailnet: raw.requiresTailnet,
      tokenRequired: raw.tokenRequired
    },
    raw
  };
  await writeJsonFile(path.join(options.runDir, "publish-result.json"), result);
  return result;
}

function parseGatewayJson(stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch {
    // npm run and similar wrappers can print script banners before the command's JSON output.
  }

  for (const line of stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reverse()) {
    try {
      return JSON.parse(line);
    } catch {
      // Keep looking for the gateway payload.
    }
  }

  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(stdout.slice(start, end + 1));
    } catch {
      // Fall through to the fail-closed error below.
    }
  }

  fail("artifact-gateway returned invalid JSON: no JSON object found in stdout");
}
