import path from "node:path";
import { fail } from "../errors.js";
import { pathExists } from "../util/fs.js";
import { publishWithTailnetGateway } from "./tailnet-gateway-publisher.js";
import {
  parsePublishMode,
  parsePublishRequired,
  parsePublishVisibility,
  type ArtifactPublishOptions,
  type ArtifactPublishResult
} from "./schemas.js";

export { type ArtifactPublishOptions, type ArtifactPublishResult } from "./schemas.js";

export function resolveArtifactPublishOptions(options: {
  publish?: string;
  publishRequired?: boolean;
  publishTtl?: string;
  publishVisibility?: string;
  artifactGatewayCommand?: string;
}): ArtifactPublishOptions {
  return {
    mode: parsePublishMode(options.publish ?? process.env.DECK_FACTORY_PUBLISH),
    required: options.publishRequired ?? parsePublishRequired(process.env.DECK_FACTORY_PUBLISH_REQUIRED),
    ttl: options.publishTtl ?? process.env.DECK_FACTORY_PUBLISH_TTL ?? "24h",
    visibility: parsePublishVisibility(options.publishVisibility ?? process.env.DECK_FACTORY_PUBLISH_VISIBILITY),
    gatewayCommand: options.artifactGatewayCommand ?? process.env.DECK_FACTORY_ARTIFACT_GATEWAY_COMMAND ?? "artifact-gateway"
  };
}

export function shouldPublishAfterQa(qaStatus: string, publishMode: string): boolean {
  return qaStatus === "passed" && publishMode !== "none";
}

export async function publishDeckArtifact(options: {
  deckPath: string;
  runDir: string;
  publishOptions: ArtifactPublishOptions;
}): Promise<{ result: ArtifactPublishResult | null; warning?: string }> {
  if (options.publishOptions.mode === "none") {
    return { result: null };
  }
  if (options.publishOptions.mode !== "tailnet-gateway") {
    fail(`Unsupported publisher: ${options.publishOptions.mode}`);
  }
  if (!(await pathExists(options.deckPath))) {
    const reason = `Cannot publish missing deck: ${options.deckPath}`;
    if (options.publishOptions.required) {
      fail(reason);
    }
    return { result: null, warning: reason };
  }

  try {
    return {
      result: await publishWithTailnetGateway({
        filePath: options.deckPath,
        runDir: options.runDir,
        artifactKind: "deck",
        publishOptions: options.publishOptions
      })
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (options.publishOptions.required) {
      fail([
        "BLOCKER: deck rendered and passed QA, but required artifact publishing failed.",
        `Deck preserved at: ${path.join(options.runDir, "deck.pptx")}`,
        `Reason: ${reason}`
      ].join("\n"));
    }
    return { result: null, warning: reason };
  }
}
