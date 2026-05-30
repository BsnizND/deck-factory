import path from "node:path";
import { DEFAULT_REGISTRY_DIR } from "../constants.js";

export function registryRoot(root = DEFAULT_REGISTRY_DIR): string {
  return path.resolve(process.cwd(), root);
}

export function templatesRegistryPath(root = DEFAULT_REGISTRY_DIR): string {
  return path.join(registryRoot(root), "templates.json");
}

export function stylesDir(root = DEFAULT_REGISTRY_DIR): string {
  return path.join(registryRoot(root), "styles");
}

export function stylePath(styleId: string, root = DEFAULT_REGISTRY_DIR): string {
  return path.join(stylesDir(root), `${styleId}.json`);
}

export function profilesDir(root = DEFAULT_REGISTRY_DIR): string {
  return path.join(registryRoot(root), "profiles");
}

export function profilePath(templateId: string, root = DEFAULT_REGISTRY_DIR): string {
  return path.join(profilesDir(root), `${templateId}.template-profile.json`);
}

export function reportsDir(root = DEFAULT_REGISTRY_DIR): string {
  return path.join(registryRoot(root), "reports");
}

export function templatePrepReportPath(templateId: string, root = DEFAULT_REGISTRY_DIR): string {
  return path.join(reportsDir(root), `${templateId}.template-prep-report.md`);
}

export function templateSecurityReportPath(templateId: string, root = DEFAULT_REGISTRY_DIR): string {
  return path.join(reportsDir(root), `${templateId}.template-security-report.json`);
}

export function templateInstructionsDir(root = DEFAULT_REGISTRY_DIR): string {
  return path.join(registryRoot(root), "template-instructions");
}

export function templateInstructionsPath(styleId: string, root = DEFAULT_REGISTRY_DIR): string {
  return path.join(templateInstructionsDir(root), `${styleId}.template-instructions.json`);
}

export function slideLibrariesDir(root = DEFAULT_REGISTRY_DIR): string {
  return path.join(registryRoot(root), "slide-libraries");
}

export function slideLibraryPath(styleId: string, root = DEFAULT_REGISTRY_DIR): string {
  return path.join(slideLibrariesDir(root), `${styleId}.json`);
}

export function libraryPrepReportPath(styleId: string, root = DEFAULT_REGISTRY_DIR): string {
  return path.join(reportsDir(root), `${styleId}.library-prep-report.md`);
}
