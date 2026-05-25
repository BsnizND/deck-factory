import type { Command } from "commander";
import { readJsonFile, resolveFromCwd } from "../../util/fs.js";
import { validateSchema, type SchemaName } from "../../schema/validate.js";

const schemaChoices: SchemaName[] = [
  "deck-spec",
  "qa-report",
  "skill-deck-handoff",
  "slide-library",
  "style-pack",
  "template-profile",
  "template-registry"
];

export function registerValidateCommand(program: Command): void {
  program
    .command("validate")
    .description("Validate a JSON file against a Deck Factory schema.")
    .requiredOption("--schema <name>", `Schema name: ${schemaChoices.join(", ")}`)
    .requiredOption("--file <path>", "JSON file to validate.")
    .action(async (options: { schema: SchemaName; file: string }) => {
      const schema = options.schema;
      if (!schemaChoices.includes(schema)) {
        throw new Error(`Unknown schema "${schema}". Expected one of: ${schemaChoices.join(", ")}`);
      }
      const value = await readJsonFile<unknown>(resolveFromCwd(options.file));
      await validateSchema(schema, value);
      console.log(`OK ${options.file} validates as ${schema}`);
    });
}
