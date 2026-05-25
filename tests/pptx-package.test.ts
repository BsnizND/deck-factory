import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { inspectPowerPointPackage, normalizePowerPointPackage } from "../src/powerpoint/pptx-package.js";

describe("PowerPoint package integrity", () => {
  it("detects and normalizes stale slide package parts", async () => {
    const deckPath = await writeFixturePptx();
    await expect(inspectPowerPointPackage(deckPath)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "stale-presentation-slide-relationship", relationshipId: "rId1" }),
        expect.objectContaining({ type: "orphan-slide-part", path: "ppt/slides/slide1.xml" }),
        expect.objectContaining({ type: "orphan-notes-slide-part", path: "ppt/notesSlides/notesSlide1.xml" }),
        expect.objectContaining({ type: "missing-content-type-target", path: "/ppt/slides/slide3.xml" }),
        expect.objectContaining({ type: "duplicate-content-type-override", path: "/ppt/slides/slide2.xml" })
      ])
    );

    const result = await normalizePowerPointPackage(deckPath);
    expect(result.removedPaths).toEqual(
      expect.arrayContaining([
        "ppt/slides/slide1.xml",
        "ppt/slides/_rels/slide1.xml.rels",
        "ppt/notesSlides/notesSlide1.xml",
        "ppt/notesSlides/_rels/notesSlide1.xml.rels"
      ])
    );
    await expect(inspectPowerPointPackage(deckPath)).resolves.toEqual([]);

    const zip = await JSZip.loadAsync(await readFile(deckPath));
    await expect(zip.file("docProps/app.xml")?.async("text")).resolves.toContain("<Slides>1</Slides>");
    expect(zip.file("ppt/slides/slide1.xml")).toBeNull();
    expect(zip.file("ppt/slides/slide2.xml")).not.toBeNull();
  });
});

async function writeFixturePptx(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "deck-factory-pptx-package-"));
  const deckPath = path.join(dir, "fixture.pptx");
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="xml" ContentType="application/xml"/>
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
        <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
        <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
        <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
        <Override PartName="/ppt/slides/slide3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
        <Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>
        <Override PartName="/ppt/notesSlides/notesSlide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>
        <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
      </Types>`)
  );
  zip.file(
    "ppt/presentation.xml",
    xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <p:sldIdLst>
          <p:sldId id="256" r:id="rId2"/>
        </p:sldIdLst>
      </p:presentation>`)
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
        <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
      </Relationships>`)
  );
  zip.file("ppt/slides/slide1.xml", "<p:sld/>");
  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>
      </Relationships>`)
  );
  zip.file("ppt/notesSlides/notesSlide1.xml", "<p:notes/>");
  zip.file("ppt/notesSlides/_rels/notesSlide1.xml.rels", "<Relationships/>");
  zip.file("ppt/slides/slide2.xml", "<p:sld/>");
  zip.file(
    "ppt/slides/_rels/slide2.xml.rels",
    xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide2.xml"/>
      </Relationships>`)
  );
  zip.file("ppt/notesSlides/notesSlide2.xml", "<p:notes/>");
  zip.file("ppt/notesSlides/_rels/notesSlide2.xml.rels", "<Relationships/>");
  zip.file("docProps/app.xml", "<Properties><Slides>2</Slides><Notes>2</Notes></Properties>");
  await writeFile(deckPath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  return deckPath;
}

function xml(value: string): string {
  return value.replace(/>\s+</g, "><").trim();
}
