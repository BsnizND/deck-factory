import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";
import { TEMPLATE_INSTRUCTIONS_SCHEMA_VERSION } from "../src/constants.js";
import { scanTemplateSecurity } from "../src/powerpoint/template-security.js";
import { templateInstructionsPath } from "../src/registry/paths.js";
import { validateDeckSpecTemplateCompliance } from "../src/template/template-compliance.js";
import { validateTemplateInstructions, type TemplateInstructions } from "../src/template/template-instructions.js";
import { writeRuntimeProvenance } from "../src/reports/runtime-provenance.js";
import { writeSourceMap } from "../src/reports/source-map.js";
import { writeJsonFile } from "../src/util/fs.js";

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((filePath) => rm(filePath, { recursive: true, force: true })));
});

describe("golden template hardening gauntlet", () => {
  it("validates template instruction sidecars", async () => {
    await expect(validateTemplateInstructions(validInstructions(), "snizco-agency")).resolves.toBeUndefined();
    await expect(
      validateTemplateInstructions(
        {
          ...validInstructions(),
          layoutInstructions: [
            {
              ...validInstructions().layoutInstructions[0],
              placeholderContracts: {}
            }
          ]
        },
        "snizco-agency"
      )
    ).rejects.toThrow(/requires placeholder df_title/);
  });

  it("catches placeholder contract violations and emits a compliance report", async () => {
    const instructionsPath = templateInstructionsPath("snizco-agency");
    cleanupPaths.push(instructionsPath);
    await writeJsonFile(instructionsPath, validInstructions());

    const tempDir = await makeTempDir("deck-factory-compliance-");
    const badSpecPath = path.join(tempDir, "bad-spec.json");
    await writeJsonFile(badSpecPath, {
      version: "deck-factory.deck-spec.v1",
      deck: {
        title: "Bad Compliance Fixture",
        audience: "QA",
        objective: "Fail correctly",
        tone: "direct",
        requestedLength: 1,
        speakerNotes: false
      },
      template: {},
      style: { styleId: "snizco-agency" },
      librarySlides: [],
      openclaw: {
        plannerAgent: "deck-factory-planner",
        reviewerAgent: "deck-factory-planner",
        polisherAgent: "deck-factory-planner",
        sessionPrefix: "gauntlet",
        requiredModelRuntime: "openclaw",
        maxRepairAttempts: 0
      },
      assets: [],
      slides: [
        {
          id: "s1",
          source: "generated",
          layout: "content",
          purpose: "Show missing placeholder behavior.",
          title: "Missing placeholder",
          content: [],
          citations: [],
          constraints: {}
        }
      ],
      constraints: {}
    });

    const { report, reportPath } = await validateDeckSpecTemplateCompliance({
      specPath: badSpecPath,
      outDir: tempDir,
      writeReport: true
    });
    expect(report.status).toBe("failed");
    expect(report.findings).toEqual(expect.arrayContaining([expect.objectContaining({ id: "missing-selection-reason" })]));
    expect(report.findings).toEqual(expect.arrayContaining([expect.objectContaining({ id: "missing-required-placeholder" })]));
    expect(reportPath).toBe(path.join(tempDir, "template-compliance-report.json"));
  });

  it("detects external relationship security blockers", async () => {
    const deckPath = await writeSecurityFixture();
    const report = await scanTemplateSecurity({ templatePath: deckPath });
    expect(report.status).toBe("failed");
    expect(report.findings).toEqual(expect.arrayContaining([expect.objectContaining({ id: "external-relationship", severity: "BLOCKER" })]));
  });

  it("emits source-map and runtime provenance artifacts", async () => {
    const tempDir = await makeTempDir("deck-factory-artifacts-");
    const specPath = path.join(tempDir, "spec.json");
    await writeJsonFile(specPath, {
      style: { styleId: "snizco-agency" },
      slides: [
        {
          id: "s1",
          layout: "content",
          title: "Artifact fixture",
          selectionReason: "The content layout fits one supported point.",
          citations: ["source-1"],
          assets: [{ assetId: "asset-1", selectionReason: "Shows evidence." }]
        }
      ]
    });
    const sourceMapPath = path.join(tempDir, "source-map.json");
    const provenancePath = path.join(tempDir, "runtime-provenance.json");
    await expect(writeSourceMap({ specPath, outPath: sourceMapPath })).resolves.toBeDefined();
    await expect(writeRuntimeProvenance({ filePath: provenancePath, templateProfile: null })).resolves.toMatchObject({
      version: "deck-factory.runtime-provenance.v1"
    });
  });
});

function validInstructions(): TemplateInstructions {
  return {
    version: TEMPLATE_INSTRUCTIONS_SCHEMA_VERSION,
    styleId: "snizco-agency",
    layoutInstructions: [
      {
        layoutId: "content",
        displayName: "Content",
        slideKind: "content",
        narrativeRole: "Make one supported point.",
        useWhen: ["The slide needs one point and compact evidence."],
        avoidWhen: ["The slide needs dense data."],
        worksFor: ["research readout"],
        contentVoice: "clear and concise",
        requiredPlaceholders: ["df_title"],
        optionalPlaceholders: ["df_body"],
        placeholderContracts: {
          df_title: {
            role: "action-title",
            contentKind: "single-sentence claim",
            writeAs: "State the takeaway.",
            voice: "direct",
            minItems: 1,
            maxItems: 1,
            maxCharacters: 80,
            maxCharactersPerItem: null,
            requiresCitations: false,
            requiresAsset: false,
            validationHints: ["Use a verb."]
          },
          df_body: {
            role: "supporting-body",
            contentKind: "bullet list",
            writeAs: "Support the takeaway.",
            voice: "compact",
            minItems: null,
            maxItems: 3,
            maxCharacters: 400,
            maxCharactersPerItem: 120,
            requiresCitations: false,
            requiresAsset: false,
            validationHints: []
          }
        },
        assetGuidance: {
          imageRole: "supporting evidence",
          imageShouldShow: "source artifact",
          avoid: ["generic imagery"]
        }
      }
    ]
  };
}

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdir(path.join(os.tmpdir(), `${prefix}${Date.now()}-${Math.random().toString(16).slice(2)}`), {
    recursive: true
  });
  const created = dir ?? path.join(os.tmpdir(), prefix);
  cleanupPaths.push(created);
  return created;
}

async function writeSecurityFixture(): Promise<string> {
  const tempDir = await makeTempDir("deck-factory-security-");
  const deckPath = path.join(tempDir, "external.pptx");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file(
    "_rels/.rels",
    '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>'
  );
  zip.file("ppt/presentation.xml", "<p:presentation/>");
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    '<Relationships><Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/></Relationships>'
  );
  await writeFile(deckPath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  return deckPath;
}
