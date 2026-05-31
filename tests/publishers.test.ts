import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DeckFactoryError } from "../src/errors.js";
import { publishDeckArtifact, resolveArtifactPublishOptions, shouldPublishAfterQa } from "../src/publishers/index.js";

describe("artifact publishing", () => {
  it("defaults to no publishing", () => {
    const options = resolveArtifactPublishOptions({});
    expect(options).toMatchObject({
      mode: "none",
      required: false,
      ttl: "24h",
      visibility: "tailnet",
      gatewayCommand: "artifact-gateway"
    });
  });

  it("publishes with artifact-gateway argv and writes normalized result JSON", async () => {
    const dir = await tempDir();
    const deckPath = path.join(dir, "deck.pptx");
    const argsPath = path.join(dir, "args.json");
    await writeFile(deckPath, "fake pptx bytes");
    const command = await fakeGatewayCommand(dir, argsPath, {
      version: "tailnet-artifact-gateway.publish-result.v1",
      artifactId: "art_TEST",
      url: "https://gateway.test/d/art_TEST/deck.pptx?t=test",
      filename: "deck.pptx",
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      bytes: 15,
      sha256: "abc",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      visibility: "tailnet",
      requiresTailnet: true,
      tokenRequired: true
    });

    const published = await publishDeckArtifact({
      deckPath,
      runDir: dir,
      publishOptions: {
        mode: "tailnet-gateway",
        required: false,
        ttl: "24h",
        visibility: "tailnet",
        gatewayCommand: command
      }
    });

    expect(published.result?.delivery.url).toBe("https://gateway.test/d/art_TEST/deck.pptx?t=test");
    const written = JSON.parse(await readFile(path.join(dir, "publish-result.json"), "utf8"));
    expect(written.version).toBe("deck-factory.publish-result.v1");
    expect(written.raw.version).toBe("tailnet-artifact-gateway.publish-result.v1");
    const args = JSON.parse(await readFile(argsPath, "utf8"));
    expect(args).toEqual([
      "publish",
      "--file",
      deckPath,
      "--ttl",
      "24h",
      "--visibility",
      "tailnet",
      "--source",
      "deck-factory",
      "--json"
    ]);
  });

  it("supports artifact-gateway command prefixes", async () => {
    const dir = await tempDir();
    const deckPath = path.join(dir, "deck.pptx");
    const argsPath = path.join(dir, "prefixed-args.json");
    await writeFile(deckPath, "fake pptx bytes");
    const script = await fakeGatewayCommand(dir, argsPath, {
      version: "tailnet-artifact-gateway.publish-result.v1",
      artifactId: "art_PREFIX",
      url: "https://gateway.test/d/art_PREFIX/deck.pptx?t=test",
      filename: "deck.pptx",
      visibility: "tailnet"
    });

    const published = await publishDeckArtifact({
      deckPath,
      runDir: dir,
      publishOptions: {
        mode: "tailnet-gateway",
        required: true,
        ttl: "2h",
        visibility: "tailnet",
        gatewayCommand: `${process.execPath} ${script}`
      }
    });

    expect(published.result?.raw.artifactId).toBe("art_PREFIX");
    const args = JSON.parse(await readFile(argsPath, "utf8"));
    expect(args.slice(0, 5)).toEqual(["publish", "--file", deckPath, "--ttl", "2h"]);
  });

  it("accepts JSON output after command wrapper noise", async () => {
    const dir = await tempDir();
    const deckPath = path.join(dir, "deck.pptx");
    const argsPath = path.join(dir, "noisy-args.json");
    await writeFile(deckPath, "fake pptx bytes");
    const command = await fakeGatewayCommand(
      dir,
      argsPath,
      {
        version: "tailnet-artifact-gateway.publish-result.v1",
        artifactId: "art_NOISY",
        url: "https://gateway.test/d/art_NOISY/deck.pptx?t=test",
        filename: "deck.pptx",
        visibility: "tailnet"
      },
      "> tailnet-artifact-gateway@0.1.0 cli\n> tsx src/cli/index.ts"
    );

    const published = await publishDeckArtifact({
      deckPath,
      runDir: dir,
      publishOptions: {
        mode: "tailnet-gateway",
        required: true,
        ttl: "1h",
        visibility: "tailnet",
        gatewayCommand: command
      }
    });

    expect(published.result?.raw.artifactId).toBe("art_NOISY");
  });

  it("reports optional and required publisher failures without deleting the deck", async () => {
    const dir = await tempDir();
    const deckPath = path.join(dir, "deck.pptx");
    await writeFile(deckPath, "fake pptx bytes");
    const command = await fakeGatewayRawCommand(dir, "not json");

    const optional = await publishDeckArtifact({
      deckPath,
      runDir: dir,
      publishOptions: {
        mode: "tailnet-gateway",
        required: false,
        ttl: "24h",
        visibility: "tailnet",
        gatewayCommand: command
      }
    });
    expect(optional.warning).toContain("artifact-gateway returned invalid JSON");
    await expect(readFile(deckPath, "utf8")).resolves.toBe("fake pptx bytes");

    await expect(
      publishDeckArtifact({
        deckPath,
        runDir: dir,
        publishOptions: {
          mode: "tailnet-gateway",
          required: true,
          ttl: "24h",
          visibility: "tailnet",
          gatewayCommand: command
        }
      })
    ).rejects.toThrow(DeckFactoryError);
  });

  it("does not publish when QA is blocked or publishing is disabled", () => {
    expect(shouldPublishAfterQa("failed", "tailnet-gateway")).toBe(false);
    expect(shouldPublishAfterQa("passed", "none")).toBe(false);
    expect(shouldPublishAfterQa("passed", "tailnet-gateway")).toBe(true);
  });
});

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "deck-factory-publishers-"));
}

async function fakeGatewayCommand(dir: string, argsPath: string, output: unknown, prefixOutput = ""): Promise<string> {
  const command = path.join(dir, "fake-gateway.mjs");
  await writeFile(
    command,
    [
      "#!/usr/bin/env node",
      "import { writeFileSync } from 'node:fs';",
      `writeFileSync(${JSON.stringify(argsPath)}, JSON.stringify(process.argv.slice(2)));`,
      ...(prefixOutput ? [`console.log(${JSON.stringify(prefixOutput)});`] : []),
      `console.log(${JSON.stringify(JSON.stringify(output))});`
    ].join("\n")
  );
  await chmod(command, 0o755);
  return command;
}

async function fakeGatewayRawCommand(dir: string, output: string): Promise<string> {
  const command = path.join(dir, "fake-gateway-invalid.mjs");
  await writeFile(command, ["#!/usr/bin/env node", `console.log(${JSON.stringify(output)});`].join("\n"));
  await chmod(command, 0o755);
  return command;
}
