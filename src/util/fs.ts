import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fail } from "../errors.js";

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    fail(`JSON file not found or unreadable: ${filePath}: ${(error as Error).message}`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    fail(`JSON file is invalid: ${filePath}: ${(error as Error).message}`);
  }
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeTextFile(filePath: string, value: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function assertReadableFile(filePath: string): Promise<void> {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      fail(`Expected a file but found something else: ${filePath}`);
    }
  } catch (error) {
    fail(`Required file is missing or unreadable: ${filePath}: ${(error as Error).message}`);
  }
}

export async function sha256File(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

export function resolveFromCwd(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

export function toPortablePath(filePath: string): string {
  const absolute = resolveFromCwd(filePath);
  const relative = path.relative(process.cwd(), absolute);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative;
  }
  return absolute;
}
