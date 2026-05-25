import path from "node:path";
import {
  APP_VERSION,
  EXTRACTOR_VERSION,
  TEMPLATE_PROFILE_SCHEMA_VERSION,
  TEMPLATE_REGISTRY_SCHEMA_VERSION
} from "../constants.js";
import { fail } from "../errors.js";
import { validateSchema } from "../schema/validate.js";
import { assertReadableFile, ensureDir, pathExists, readJsonFile, resolveFromCwd, toPortablePath, writeJsonFile } from "../util/fs.js";
import { fingerprintFile } from "./fingerprint.js";
import { profilePath, templatesRegistryPath } from "./paths.js";
import { extractTemplateProfile } from "../template/extract-template-profile.js";

export interface TemplateRegistry {
  version: string;
  templates: TemplateRegistryEntry[];
}

export interface TemplateRegistryEntry {
  templateId: string;
  displayName: string;
  sourceTemplateDeckPath: string;
  sourceContentHash: string;
  extractorVersion: string;
  profileSchemaVersion: string;
  cachedProfilePath: string;
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
  force?: boolean;
}): Promise<TemplateRegistryEntry> {
  const sourcePath = resolveFromCwd(options.templateDeckPath);
  await assertPptx(sourcePath, "template deck");
  const sourceContentHash = await fingerprintFile(sourcePath);
  const registry = await loadTemplateRegistry();
  const existing = registry.templates.find((entry) => entry.templateId === options.templateId);
  const cachedProfilePath = profilePath(options.templateId);
  const portableCachedProfilePath = toPortablePath(cachedProfilePath);
  const canReuse =
    existing &&
    !options.force &&
    existing.sourceContentHash === sourceContentHash &&
    existing.extractorVersion === EXTRACTOR_VERSION &&
    existing.profileSchemaVersion === TEMPLATE_PROFILE_SCHEMA_VERSION &&
    (await pathExists(resolveFromCwd(existing.cachedProfilePath)));

  if (canReuse) {
    return existing;
  }

  const profile = await extractTemplateProfile({
    sourceTemplateDeckPath: toPortablePath(sourcePath),
    sourceContentHash,
    templateId: options.templateId
  });
  await ensureDir(path.dirname(cachedProfilePath));
  await writeJsonFile(cachedProfilePath, profile);

  const now = new Date().toISOString();
  const next: TemplateRegistryEntry = {
    templateId: options.templateId,
    displayName: options.displayName,
    sourceTemplateDeckPath: toPortablePath(sourcePath),
    sourceContentHash,
    extractorVersion: EXTRACTOR_VERSION,
    profileSchemaVersion: TEMPLATE_PROFILE_SCHEMA_VERSION,
    cachedProfilePath: portableCachedProfilePath,
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
