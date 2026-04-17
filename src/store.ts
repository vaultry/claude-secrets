import { readFile, writeFile, rename, access, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { encrypt, decrypt, getMasterKey } from "./crypto.js";

export const STORE_PATH = join(homedir(), ".claude", "secrets.encrypted");

export type Secrets = Record<string, string>;

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

export async function readStore(): Promise<Secrets> {
  if (!(await exists(STORE_PATH))) return {};
  const raw = (await readFile(STORE_PATH, "utf8")).trim();
  if (!raw) return {};
  const key = await getMasterKey();
  const plaintext = decrypt(raw, key);
  return JSON.parse(plaintext) as Secrets;
}

export async function writeStore(secrets: Secrets): Promise<void> {
  const key = await getMasterKey();
  const payload = encrypt(JSON.stringify(secrets), key);
  const tmp = `${STORE_PATH}.tmp.${randomBytes(4).toString("hex")}`;
  try {
    await writeFile(tmp, payload, { encoding: "utf8", mode: 0o600 });
    await rename(tmp, STORE_PATH);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}

export async function getSecret(name: string): Promise<string | undefined> {
  const all = await readStore();
  return all[name];
}

export async function setSecret(name: string, value: string): Promise<void> {
  const all = await readStore();
  all[name] = value;
  await writeStore(all);
}

export async function deleteSecret(name: string): Promise<boolean> {
  const all = await readStore();
  if (!(name in all)) return false;
  delete all[name];
  await writeStore(all);
  return true;
}

export async function listSecretNames(): Promise<string[]> {
  const all = await readStore();
  return Object.keys(all).sort();
}

export async function searchSecrets(pattern: string): Promise<string[]> {
  let re: RegExp;
  try { re = new RegExp(pattern, "i"); } catch { return []; }
  const names = await listSecretNames();
  return names.filter((n) => re.test(n));
}
