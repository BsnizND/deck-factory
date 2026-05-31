import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writePackageManifest } from "../src/reports/package-manifest.js";
import { validateSchema } from "../src/schema/validate.js";

describe("package manifest", () => {
  it("separates the default deck handoff from internal evidence", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "deck-factory-package-manifest-"));
    const screenshotsDir = path.join(dir, "screenshots");
    await mkdir(screenshotsDir);
    const paths = {
      deckPath: path.join(dir, "deck.pptx"),
      runSummaryPath: path.join(dir, "run-summary.json"),
      specPath: path.join(dir, "deck-spec.json"),
      operationsPath: path.join(dir, "operations.jsonl"),
      qaReportPath: path.join(dir, "qa-report.json"),
      capabilitiesPath: path.join(dir, "capabilities.json"),
      powerPointFilesPath: path.join(dir, "powerpoint-files.json"),
      templateComplianceReportPath: path.join(dir, "template-compliance-report.json"),
      templateSecurityReportPath: path.join(dir, "template-security-report.json"),
      runtimeProvenancePath: path.join(dir, "runtime-provenance.json"),
      sourceMapPath: path.join(dir, "source-map.json"),
      productQualityReportPath: path.join(dir, "product-quality-report.json"),
      publishResultPath: path.join(dir, "publish-result.json")
    };
    for (const filePath of Object.values(paths)) {
      await writeFile(filePath, `${path.basename(filePath)}\n`);
    }

    const manifest = await writePackageManifest({
      outPath: path.join(dir, "package-manifest.json"),
      runDir: dir,
      screenshotsDir,
      publishResult: {
        version: "deck-factory.publish-result.v1",
        status: "published",
        createdAt: "2026-05-31T00:00:00.000Z",
        publisher: { id: "tailnet-artifact-gateway", command: "artifact-gateway" },
        artifact: { kind: "deck", path: paths.deckPath, filename: "deck.pptx" },
        delivery: {
          url: "https://gateway.test/d/art_TEST/deck.pptx?t=secret",
          visibility: "tailnet",
          expiresAt: "2026-06-01T00:00:00.000Z",
          requiresTailnet: true,
          tokenRequired: true
        },
        raw: {
          version: "tailnet-artifact-gateway.publish-result.v1",
          artifactId: "art_TEST",
          url: "https://gateway.test/d/art_TEST/deck.pptx?t=secret",
          filename: "deck.pptx",
          visibility: "tailnet"
        }
      },
      ...paths
    });

    await expect(validateSchema("package-manifest", manifest)).resolves.toBeUndefined();
    expect(manifest.handoffPolicy).toMatchObject({
      defaultHandoff: "deck-only",
      approvalPackageRequiresExplicitRequest: true,
      publicRoutesAllowed: false,
      publishedDeliveryVisibility: "tailnet"
    });
    expect(manifest.artifacts.filter((artifact) => artifact.includedInDefaultHandoff)).toEqual([
      expect.objectContaining({ role: "primary-deck", path: paths.deckPath })
    ]);
    expect(manifest.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "delivery-metadata", retentionClass: "delivery-control" }),
        expect.objectContaining({ kind: "directory", path: screenshotsDir })
      ])
    );
    const raw = await readFile(path.join(dir, "package-manifest.json"), "utf8");
    expect(raw).not.toContain("t=secret");
  });
});
