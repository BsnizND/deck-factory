#!/usr/bin/env node
import { Command } from "commander";
import { APP_VERSION } from "../constants.js";
import { DeckFactoryError } from "../errors.js";
import { registerBuildCommand } from "./commands/build.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerLibrariesCommand } from "./commands/libraries.js";
import { registerTemplatesCommand } from "./commands/templates.js";
import { registerValidateCommand } from "./commands/validate.js";

const program = new Command();

program
  .name("deck-factory")
  .description("OpenClaw-backed deck production workflow for PPTX styles and slide libraries.")
  .version(APP_VERSION);

registerDoctorCommand(program);
registerBuildCommand(program);
registerTemplatesCommand(program);
registerLibrariesCommand(program);
registerValidateCommand(program);

program.exitOverride();

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof DeckFactoryError) {
    console.error(error.message);
    process.exit(error.exitCode);
  }
  if ((error as { code?: string }).code === "commander.helpDisplayed") {
    process.exit(0);
  }
  if ((error as { code?: string }).code === "commander.version") {
    process.exit(0);
  }
  console.error((error as Error).message);
  process.exit(1);
}
