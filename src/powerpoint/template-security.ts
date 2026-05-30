import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { TEMPLATE_SECURITY_REPORT_SCHEMA_VERSION } from "../constants.js";
import { validateSchema } from "../schema/validate.js";
import { resolveFromCwd, toPortablePath, writeJsonFile } from "../util/fs.js";
import { highestStatusFromFindings, type SeverityFinding } from "../reports/severity.js";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

export interface TemplateSecurityReport {
  version: string;
  status: "passed" | "warning" | "failed";
  templatePath: string;
  scannedAt: string;
  findings: SeverityFinding[];
}

export async function scanTemplateSecurity(options: {
  templatePath: string;
  outPath?: string;
  allowExternalRelationships?: boolean;
  allowEmbeddedMedia?: boolean;
}): Promise<TemplateSecurityReport> {
  const templatePath = resolveFromCwd(options.templatePath);
  const findings: SeverityFinding[] = [];
  if (path.extname(templatePath).toLowerCase() === ".pptm") {
    findings.push(finding("macro-enabled-input", "BLOCKER", "security", "Macro-enabled PowerPoint files are rejected by default."));
  }
  const zip = await JSZip.loadAsync(await readFile(templatePath));
  const files = Object.keys(zip.files).filter((fileName) => !zip.files[fileName]?.dir);

  for (const fileName of files) {
    if (/vbaProject\.bin$/i.test(fileName)) {
      findings.push(finding("macro-project", "BLOCKER", "security", `Macro project detected in package part ${fileName}.`));
    }
    if (/^ppt\/embeddings\//.test(fileName) || /\.(bin|oleObject)$/i.test(fileName)) {
      findings.push(finding("embedded-object", "MAJOR", "security", `Embedded object detected in package part ${fileName}.`));
    }
    if (/^ppt\/media\//.test(fileName) && !options.allowEmbeddedMedia) {
      findings.push(finding("embedded-media", "MINOR", "security", `Embedded media detected in package part ${fileName}.`));
    }
    if (/^ppt\/comments\//.test(fileName)) {
      findings.push(finding("comments", "MINOR", "metadata", `Comment part detected in package part ${fileName}.`));
    }
    if (/^ppt\/notesSlides\//.test(fileName)) {
      findings.push(finding("speaker-notes", "MINOR", "metadata", `Speaker notes part detected in package part ${fileName}.`));
    }
    if (/^customXml\//.test(fileName)) {
      findings.push(finding("custom-xml", "MINOR", "metadata", `Custom XML part detected in package part ${fileName}.`));
    }
  }

  for (const relsPath of files.filter((fileName) => /(^|\/)_rels\/.+\.rels$/.test(fileName))) {
    const rels = await readRelationships(zip, relsPath);
    for (const relationship of rels) {
      if (relationship.TargetMode === "External" && !options.allowExternalRelationships) {
        findings.push(
          finding(
            "external-relationship",
            "BLOCKER",
            "security",
            `External relationship detected in ${relsPath}: ${relationship.Target ?? "(missing target)"}.`,
            { relationshipId: relationship.Id, target: relationship.Target, relsPath }
          )
        );
      }
    }
  }

  const presentationXml = await zip.file("ppt/presentation.xml")?.async("text");
  if (presentationXml && /show="0"/.test(presentationXml)) {
    findings.push(finding("hidden-slide", "MINOR", "metadata", "Hidden slide marker detected in presentation.xml."));
  }

  for (const propsPath of ["docProps/core.xml", "docProps/app.xml", "docProps/custom.xml"]) {
    if (zip.file(propsPath)) {
      findings.push(finding("document-metadata", "INFO", "metadata", `Document metadata part present: ${propsPath}.`));
    }
  }

  const report: TemplateSecurityReport = {
    version: TEMPLATE_SECURITY_REPORT_SCHEMA_VERSION,
    status: highestStatusFromFindings(findings),
    templatePath: toPortablePath(templatePath),
    scannedAt: new Date().toISOString(),
    findings
  };
  await validateSchema("template-security-report", report);
  if (options.outPath) {
    await writeJsonFile(options.outPath, report);
  }
  return report;
}

function finding(
  id: string,
  severity: SeverityFinding["severity"],
  category: string,
  message: string,
  evidence?: unknown
): SeverityFinding {
  return { id, severity, category, message, evidence };
}

interface Relationship {
  Id?: string;
  Type?: string;
  Target?: string;
  TargetMode?: string;
}

async function readRelationships(zip: JSZip, relsPath: string): Promise<Relationship[]> {
  const xml = await zip.file(relsPath)?.async("text");
  if (!xml) {
    return [];
  }
  const doc = parser.parse(xml) as { Relationships?: { Relationship?: Relationship | Relationship[] } };
  const relationships = doc.Relationships?.Relationship;
  if (!relationships) {
    return [];
  }
  return Array.isArray(relationships) ? relationships : [relationships];
}
