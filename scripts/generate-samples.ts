import path from "node:path";
import { createRequire } from "node:module";
import {
  DECK_SPEC_SCHEMA_VERSION,
  SKILL_HANDOFF_SCHEMA_VERSION
} from "../src/constants.js";
import { ensureDir, writeJsonFile } from "../src/util/fs.js";

const root = process.cwd();
const require = createRequire(import.meta.url);
const PptxGenJS = require("pptxgenjs");

async function main(): Promise<void> {
  await ensureDir(path.join(root, "samples/snizco-agency"));
  await ensureDir(path.join(root, "samples/5c-research"));
  await createTemplateDeck(path.join(root, "samples/snizco-agency/template.pptx"));
  await createLibraryDeck(path.join(root, "samples/snizco-agency/library.pptx"));
  await writeJsonFile(path.join(root, "samples/snizco-agency/deck-spec.json"), sampleDeckSpec());
  await writeJsonFile(path.join(root, "samples/5c-research/chick-fil-a-handoff.json"), sampleHandoff());
}

async function createTemplateDeck(filePath: string): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Deck Factory";
  addTemplateSlide(pptx, "DF_LAYOUT: title", "df_title", "Executive Strategy Report", "df_subtitle", "Prepared for {{audience}}");
  addTemplateSlide(pptx, "DF_LAYOUT: content", "df_title", "{{title}}", "df_body", "{{body}}");
  addTemplateSlide(pptx, "DF_LAYOUT: two-column", "df_title", "{{title}}", "df_body", "{{left_column}}\n\n{{right_column}}");
  addTemplateSlide(pptx, "DF_LAYOUT: chart", "df_title", "{{title}}", "df_body", "{{chart}}\n\n{{source}}");
  await pptx.writeFile({ fileName: filePath });
}

async function createLibraryDeck(filePath: string): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Deck Factory";
  addTemplateSlide(pptx, "DF_LIBRARY: about-us\nDF_KIND: full-built", "df_title", "About Snizco Agency", "df_body", "A strategy and AI workflows studio for high-trust communications, research, and client delivery.");
  addTemplateSlide(pptx, "DF_LIBRARY: methodology\nDF_KIND: full-built", "df_title", "Methodology", "df_body", "We combine structured research, agentic synthesis, reusable templates, and human approval gates.");
  addTemplateSlide(pptx, "DF_LIBRARY: case-study\nDF_KIND: parameterized", "df_title", "{{client}} Case Study", "df_body", "Challenge: {{challenge}}\nSolution: {{solution}}\nResult: {{result}}");
  await pptx.writeFile({ fileName: filePath });
}

function addTemplateSlide(
  pptx: any,
  note: string,
  titleName: string,
  title: string,
  bodyName: string,
  body: string
): void {
  const slide = pptx.addSlide();
  slide.background = { color: "F7F4EF" };
  slide.addNotes(note);
  slide.addText(note, {
    x: 0.1,
    y: 7.15,
    w: 2.6,
    h: 0.18,
    fontFace: "Aptos",
    fontSize: 1,
    color: "F7F4EF",
    objectName: "df_metadata"
  });
  slide.addText(title, {
    x: 0.6,
    y: 0.45,
    w: 12,
    h: 0.65,
    fontFace: "Aptos Display",
    fontSize: 30,
    bold: true,
    color: "1F2933",
    objectName: titleName
  });
  slide.addShape(pptx.ShapeType.line, { x: 0.6, y: 1.25, w: 11.7, h: 0, line: { color: "C94C2E", width: 2 } });
  slide.addText(body, {
    x: 0.75,
    y: 1.55,
    w: 11.2,
    h: 4.7,
    fontFace: "Aptos",
    fontSize: 18,
    color: "24313A",
    breakLine: false,
    fit: "shrink",
    objectName: bodyName
  });
  slide.addText("Snizco Agency", {
    x: 10.5,
    y: 6.9,
    w: 1.8,
    h: 0.25,
    fontFace: "Aptos",
    fontSize: 9,
    color: "667085",
    objectName: "df_footer"
  });
}

function sampleDeckSpec(): unknown {
  return {
    version: DECK_SPEC_SCHEMA_VERSION,
    deck: {
      title: "Sample 5C Research Report",
      audience: "executive",
      objective: "Demonstrate a mixed generated/library deck.",
      tone: "concise and evidence-led",
      requestedLength: 5,
      speakerNotes: false
    },
    template: { templateId: "snizco-agency" },
    style: { styleId: "snizco-agency" },
    librarySlides: [{ slideId: "about-us" }],
    openclaw: {
      plannerAgent: "jay",
      reviewerAgent: "jay",
      polisherAgent: "jay",
      sessionPrefix: "deck-factory-sample",
      requiredModelRuntime: "openclaw",
      maxRepairAttempts: 1
    },
    assets: [],
    slides: [
      {
        id: "s1",
        source: "generated",
        layout: "title",
        purpose: "Introduce the report.",
        title: "Chick-fil-A 5C Research Report",
        content: [{ type: "text", text: "Sample fixture, not live research." }],
        citations: [],
        constraints: {}
      },
      {
        id: "s2",
        source: "library",
        layout: "about-us",
        librarySlideId: "about-us",
        purpose: "Insert standard agency context.",
        title: "About Snizco Agency",
        content: [],
        citations: [],
        constraints: {}
      }
    ],
    constraints: { fixture: true }
  };
}

function sampleHandoff(): unknown {
  return {
    version: SKILL_HANDOFF_SCHEMA_VERSION,
    sourceSkill: "5c-research-report",
    sourceRunId: "sample-fixture",
    reportType: "5c-research-report",
    subject: "Chick-fil-A",
    audience: "executive",
    objective: "Create a concise 5C research deck. This is a sample fixture, not live research.",
    preferredStyleId: "snizco-agency",
    sections: [
      { id: "company", title: "Company", summary: "Sample company context." },
      { id: "customers", title: "Customers", summary: "Sample customer context." },
      { id: "competitors", title: "Competitors", summary: "Sample competitor context." }
    ],
    findings: [
      { id: "f1", section: "company", text: "Sample fixture finding; not a live research claim." }
    ],
    evidence: [],
    citations: [],
    requestedCharts: [],
    requestedTables: [],
    requestedLibrarySlides: ["about-us", "methodology"],
    assetRefs: [],
    sensitivity: "fixture-public",
    openQuestions: []
  };
}

await main();
