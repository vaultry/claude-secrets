import { readFile } from "node:fs/promises";
import type { Secrets } from "./store.js";

export const PLACEHOLDER_RE = /secret:\/\/([A-Za-z0-9_.-]+)/g;

export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

export function expandPlaceholders(
  text: string,
  store: Secrets,
  onMissing: "throw" | "empty" | "keep" = "throw"
): { result: string; missing: string[] } {
  const missing: string[] = [];
  const result = text.replace(PLACEHOLDER_RE, (match, name: string) => {
    if (name in store) return store[name];
    missing.push(name);
    if (onMissing === "throw") throw new Error(`Secret '${name}' niet gevonden in store`);
    if (onMissing === "keep") return match;
    return "";
  });
  return { result, missing };
}

export async function resolveDotenvFile(
  path: string,
  store: Secrets,
  onMissing: "throw" | "empty" | "keep" = "throw"
): Promise<{ env: Record<string, string>; missing: string[] }> {
  const raw = await readFile(path, "utf8");
  const parsed = parseDotenv(raw);
  const allMissing: string[] = [];
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    const { result, missing } = expandPlaceholders(v, store, onMissing);
    env[k] = result;
    allMissing.push(...missing);
  }
  return { env, missing: allMissing };
}
