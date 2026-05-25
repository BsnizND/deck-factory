import path from "node:path";
import { fail } from "../errors.js";
import { assertReadableFile, resolveFromCwd, toPortablePath } from "../util/fs.js";

export type PowerPointFileRole = "template-deck" | "powerpoint-template" | "reference-deck" | "generated-output";

export interface PowerPointFileRoleRecord {
  role: PowerPointFileRole;
  path: string;
  portablePath: string;
  extension: string;
  status: "accepted" | "future";
}

export async function assertPowerPointFileRole(inputPath: string, role: PowerPointFileRole): Promise<PowerPointFileRoleRecord> {
  const absolutePath = resolveFromCwd(inputPath);
  if (role !== "generated-output") {
    await assertReadableFile(absolutePath);
  }
  const extension = path.extname(absolutePath).toLowerCase();
  if (role === "powerpoint-template") {
    if (extension !== ".potx") {
      fail(`Expected PowerPoint template input to be a .potx file: ${absolutePath}`);
    }
    fail(
      [
        `PowerPoint template files (.potx) are a future input role for Deck Factory v0: ${absolutePath}`,
        "For now, open the .potx in PowerPoint, create representative dummy slides, and save it as a prepared .pptx template deck.",
        "Then register it with --template-deck."
      ].join("\n")
    );
  }
  if (role === "template-deck" && extension !== ".pptx") {
    fail(`Expected template deck input to be a prepared .pptx file with representative dummy slides: ${absolutePath}`);
  }
  if (role === "reference-deck" && extension !== ".pptx") {
    fail(`Expected reference/source deck input to be a .pptx file that will be read but not mutated: ${absolutePath}`);
  }
  if (role === "generated-output" && extension !== ".pptx") {
    fail(`Expected generated output deck path to end in .pptx: ${absolutePath}`);
  }
  return {
    role,
    path: absolutePath,
    portablePath: toPortablePath(absolutePath),
    extension,
    status: "accepted"
  };
}
