import path from "node:path";
import {
  APP_VERSION,
  EXTRACTOR_VERSION,
  TEMPLATE_PROFILE_SCHEMA_VERSION,
  TEMPLATE_REGISTRY_SCHEMA_VERSION
} from "../constants.js";
import { fail } from "../errors.js";
import { assertPowerPointFileRole, type PowerPointFileRole } from "../powerpoint/file-roles.js";
import { validateSchema } from "../schema/validate.js";
import { assertReadableFile, ensureDir, pathExists, readJsonFile, resolveFromCwd, toPortablePath, writeJsonFile, writeTextFile } from "../util/fs.js";
import { fingerprintFile } from "./fingerprint.js";
import { profilePath, templatePrepReportPath, templatesRegistryPath } from "./paths.js";
import { extractTemplateProfile } from "../template/extract-template-profile.js";
import type { TemplateProfile } from "../template/extract-template-profile.js";

export interface TemplateRegistry {
  version: string;
  templates: TemplateRegistryEntry[];
}

export interface TemplateRegistryEntry {
  templateId: string;
  displayName: string;
  sourceFileRole: "template-deck";
  sourceTemplateDeckPath: string;
  sourceContentHash: string;
  extractorVersion: string;
  profileSchemaVersion: string;
  cachedProfilePath: string;
  prepReportPath: string;
  preparationStatus: "ready" | "needs-prep" | "unsupported";
  supportedArchetypes: string[];
  createdAt: string;
  updatedAt: string;
}

export async function loadTemplateRegistry(): Promise<TemplateRegistry> {
  const registryPath = templatesRegistryPath();
  if (!(await pathExists(registryPath))) {
    return { version: TEMPLATE_REGISTRY_SCHEMA_VERSION, templates: [] };
  }
  const registry = await readJsonFile<TemplateRegistry>(registryPath);
  await validateSchema("template-registry", registry);
  return registry;
}

export async function saveTemplateRegistry(registry: TemplateRegistry): Promise<void> {
  await validateSchema("template-registry", registry);
  await writeJsonFile(templatesRegistryPath(), registry);
}

export async function registerTemplate(options: {
  templateId: string;
  displayName: string;
  templateDeckPath: string;
  sourceFileRole?: Extract<PowerPointFileRole, "template-deck" | "powerpoint-template">;
  force?: boolean;
}): Promise<TemplateRegistryEntry> {
  const fileRole = await assertPowerPointFileRole(options.templateDeckPath, options.sourceFileRole ?? "template-deck");
  const sourcePath = fileRole.path;
  const sourceContentHash = await fingerprintFile(sourcePath);
  const registry = await loadTemplateRegistry();
  const existing = registry.templates.find((entry) => entry.templateId === options.templateId);
  const cachedProfilePath = profilePath(options.templateId);
  const portableCachedProfilePath = toPortablePath(cachedProfilePath);
  const prepReportPath = templatePrepReportPath(options.templateId);
  const portablePrepReportPath = toPortablePath(prepReportPath);
  const canReuse =
    existing &&
    !options.force &&
    existing.sourceContentHash === sourceContentHash &&
    existing.extractorVersion === EXTRACTOR_VERSION &&
    existing.profileSchemaVersion === TEMPLATE_PROFILE_SCHEMA_VERSION &&
    (await pathExists(resolveFromCwd(existing.cachedProfilePath)));

  if (canReuse) {
    const profile = await readJsonFile<TemplateProfile>(resolveFromCwd(existing.cachedProfilePath));
    await writeTemplatePrepReport(prepReportPath, profile, existing);
    return existing;
  }

  const profile = await extractTemplateProfile({
    sourceTemplateDeckPath: toPortablePath(sourcePath),
    sourceContentHash,
    templateId: options.templateId
  });
  await ensureDir(path.dirname(cachedProfilePath));
  await writeJsonFile(cachedProfilePath, profile);
  await writeTemplatePrepReport(prepReportPath, profile, {
    templateId: options.templateId,
    displayName: options.displayName,
    sourceFileRole: "template-deck",
    sourceTemplateDeckPath: toPortablePath(sourcePath),
    sourceContentHash,
    preparationStatus: profile.preparationStatus,
    supportedArchetypes: profile.detectedPatterns.map((pattern) => pattern.name)
  });

  const now = new Date().toISOString();
  const next: TemplateRegistryEntry = {
    templateId: options.templateId,
    displayName: options.displayName,
    sourceFileRole: "template-deck",
    sourceTemplateDeckPath: toPortablePath(sourcePath),
    sourceContentHash,
    extractorVersion: EXTRACTOR_VERSION,
    profileSchemaVersion: TEMPLATE_PROFILE_SCHEMA_VERSION,
    cachedProfilePath: portableCachedProfilePath,
    prepReportPath: portablePrepReportPath,
    preparationStatus: profile.preparationStatus,
    supportedArchetypes: profile.detectedPatterns.map((pattern) => pattern.name),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  const withoutExisting = registry.templates.filter((entry) => entry.templateId !== options.templateId);
  await saveTemplateRegistry({ ...registry, templates: [...withoutExisting, next].sort(sortTemplates) });
  return next;
}

export async function refreshTemplate(templateId: string): Promise<TemplateRegistryEntry> {
  const registry = await loadTemplateRegistry();
  const existing = registry.templates.find((entry) => entry.templateId === templateId);
  if (!existing) {
    fail(`Template style is not registered: ${templateId}`);
  }
  return registerTemplate({
    templateId,
    displayName: existing.displayName,
    templateDeckPath: resolveFromCwd(existing.sourceTemplateDeckPath),
    force: true
  });
}

export async function inspectTemplate(templateId: string): Promise<TemplateRegistryEntry> {
  const registry = await loadTemplateRegistry();
  const entry = registry.templates.find((item) => item.templateId === templateId);
  if (!entry) {
    fail(`Template style is not registered: ${templateId}`);
  }
  return entry;
}

async function assertPptx(filePath: string, role: string): Promise<void> {
  await assertReadableFile(filePath);
  if (path.extname(filePath).toLowerCase() !== ".pptx") {
    fail(`Expected ${role} to be a .pptx file for v0: ${filePath}`);
  }
}

function sortTemplates(a: TemplateRegistryEntry, b: TemplateRegistryEntry): number {
  return a.templateId.localeCompare(b.templateId);
}

async function writeTemplatePrepReport(
  filePath: string,
  profile: TemplateProfile,
  entry: Pick<
    TemplateRegistryEntry,
    | "templateId"
    | "displayName"
    | "sourceFileRole"
    | "sourceTemplateDeckPath"
    | "sourceContentHash"
    | "preparationStatus"
    | "supportedArchetypes"
  >
): Promise<void> {
  const findings = profile.preparationFindings
    .map((finding) => `- ${finding.severity.toUpperCase()}: ${finding.message}`)
    .join("\n");
  const layouts = profile.layouts
    .map((layout) => `- ${layout.id}: source slide ${layout.sourceSlide ?? "unknown"}`)
    .join("\n");
  await writeTextFile(
    filePath,
    [
      `# Template Prep Report: ${entry.displayName}`,
      "",
      `- Template id: ${entry.templateId}`,
      `- Source file role: ${entry.sourceFileRole}`,
      `- Source deck: ${entry.sourceTemplateDeckPath}`,
      `- Source hash: ${entry.sourceContentHash}`,
      `- Preparation status: ${entry.preparationStatus}`,
      `- Slide size: ${profile.slideSize.width ?? "unknown"} x ${profile.slideSize.height ?? "unknown"}`,
      `- Supported archetypes: ${entry.supportedArchetypes.join(", ") || "none"}`,
      "",
      "## Findings",
      "",
      findings || "- No findings recorded.",
      "",
      "## Detected Layouts",
      "",
      layouts || "- No layouts detected.",
      "",
      "## Template Preparation Contract",
      "",
      "- Use a `.pptx` template deck with representative dummy slides.",
      "- Add `DF_LAYOUT: title`, `DF_LAYOUT: content`, or similar markers to reusable pattern slides.",
      "- Name editable shapes in PowerPoint's Selection Pane with stable names such as `df_title`, `df_body`, and `df_footer`.",
      "- Keep important editable content as PowerPoint text, table, chart, image, or shape objects rather than flattened screenshots."
    ].join("\n")
  );
}
