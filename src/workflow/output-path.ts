import path from "node:path";
import { fail } from "../errors.js";
import { readJsonFile, resolveFromCwd } from "../util/fs.js";

interface SkillDeckHandoff {
  subject?: string;
  reportType?: string;
}

interface DeckSpec {
  deck?: {
    title?: string;
    objective?: string;
  };
}

export async function resolveRunOutputDirectory(options: {
  outDir?: string;
  handoffPath?: string;
  specPath?: string;
  styleId: string;
}): Promise<string> {
  if (options.outDir?.trim()) {
    return options.outDir;
  }
  if (options.handoffPath) {
    const handoff = await readJsonFile<SkillDeckHandoff>(resolveFromCwd(options.handoffPath));
    return defaultRunOutputDirectory({
      subject: requiredString(handoff.subject, "handoff.subject"),
      reportType: requiredString(handoff.reportType, "handoff.reportType"),
      styleId: options.styleId
    });
  }
  if (options.specPath) {
    const spec = await readJsonFile<DeckSpec>(resolveFromCwd(options.specPath));
    const title = requiredString(spec.deck?.title, "deck.title");
    return defaultRunOutputDirectory({
      subject: title,
      reportType: "deck",
      styleId: options.styleId
    });
  }
  fail("Cannot derive output directory without --out, --handoff, or --spec.");
}

export function defaultRunOutputDirectory(options: { subject: string; reportType: string; styleId: string }): string {
  return path.join("artifacts", `${slugify(options.subject)}-${slugify(options.reportType)}-${slugify(options.styleId)}`);
}

export function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "untitled";
}

function requiredString(value: string | undefined, fieldName: string): string {
  if (!value?.trim()) {
    fail(`Cannot derive output directory because ${fieldName} is missing or empty. Provide --out explicitly.`);
  }
  return value;
}
