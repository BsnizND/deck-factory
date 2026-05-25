import { sha256File } from "../util/fs.js";

export async function fingerprintFile(filePath: string): Promise<string> {
  return sha256File(filePath);
}

export function isFingerprintCurrent(expected: string, actual: string): boolean {
  return expected === actual;
}
