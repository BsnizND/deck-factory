import type { Command } from "commander";
import { loadSlideLibrary, registerSlideLibrary } from "../../registry/slide-library.js";
import { fail } from "../../errors.js";

export function registerLibrariesCommand(program: Command): void {
  const libraries = program.command("libraries").description("Register and inspect reusable slide libraries for styles.");

  libraries
    .command("register")
    .description("Register a slide library deck for an existing style.")
    .requiredOption("--style <id>", "Registered style id.")
    .requiredOption("--library-deck <path>", "Prepared .pptx slide library deck.")
    .option("--name <name>", "Display name.")
    .option("--force", "Force re-indexing even if the fingerprint is current.")
    .action(async (options: { style: string; libraryDeck: string; name?: string; force?: boolean }) => {
      const library = await registerSlideLibrary({
        styleId: options.style,
        libraryDeckPath: options.libraryDeck,
        displayName: options.name,
        force: options.force
      });
      console.log(JSON.stringify(library, null, 2));
    });

  libraries
    .command("list")
    .description("List slides in a registered style library.")
    .requiredOption("--style <id>", "Registered style id.")
    .action(async (options: { style: string }) => {
      console.log(JSON.stringify(await loadSlideLibrary(options.style), null, 2));
    });

  libraries
    .command("inspect")
    .description("Inspect one slide library entry.")
    .requiredOption("--style <id>", "Registered style id.")
    .argument("<slideId>", "Library slide id.")
    .action(async (slideId: string, options: { style: string }) => {
      const library = await loadSlideLibrary(options.style);
      const slide = library.slides.find((entry) => entry.slideId === slideId);
      if (!slide) {
        fail(`Library slide is not registered for style ${options.style}: ${slideId}`);
      }
      console.log(JSON.stringify(slide, null, 2));
    });
}
