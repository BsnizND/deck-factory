import { createRequire } from "node:module";
import type { ErrorObject } from "ajv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile } from "../util/fs.js";
import { fail } from "../errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceRepoRoot = path.resolve(__dirname, "../..");
const builtRepoRoot = path.resolve(__dirname, "../../..");
const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats") as (ajv: unknown) => void;

export type SchemaName =
  | "deck-spec"
  | "qa-report"
  | "skill-deck-handoff"
  | "slide-library"
  | "style-pack"
  | "template-profile"
  | "template-registry";

const schemaFileByName: Record<SchemaName, string> = {
  "deck-spec": "deck-spec.schema.json",
  "qa-report": "qa-report.schema.json",
  "skill-deck-handoff": "skill-deck-handoff.schema.json",
  "slide-library": "slide-library.schema.json",
  "style-pack": "style-pack.schema.json",
  "template-profile": "template-profile.schema.json",
  "template-registry": "template-registry.schema.json"
};

export async function validateSchema(name: SchemaName, value: unknown): Promise<void> {
  const schema = await loadSchema(name);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(value)) {
    fail(`Schema validation failed for ${name}:\n${formatAjvErrors(validate.errors ?? [])}`);
  }
}

export async function loadSchema(name: SchemaName): Promise<Record<string, unknown>> {
  return readJsonFile<Record<string, unknown>>(path.join(schemaRoot(), schemaFileByName[name]));
}

function schemaRoot(): string {
  const cwdSchemaRoot = path.join(process.cwd(), "schemas");
  const sourceSchemaRoot = path.join(sourceRepoRoot, "schemas");
  const builtSchemaRoot = path.join(builtRepoRoot, "schemas");
  if (process.env.DECK_FACTORY_SCHEMA_ROOT) {
    return process.env.DECK_FACTORY_SCHEMA_ROOT;
  }
  if (process.cwd()) {
    return cwdSchemaRoot;
  }
  return sourceSchemaRoot || builtSchemaRoot;
}

function formatAjvErrors(errors: ErrorObject[]): string {
  return errors
    .map((error) => {
      const instancePath = error.instancePath || "/";
      return `- ${instancePath} ${error.message ?? "is invalid"}`;
    })
    .join("\n");
}
