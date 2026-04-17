import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const KEYCHAIN_SERVICE = "claude-secrets-mcp";
const KEYCHAIN_ACCOUNT = "master-key";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export async function getMasterKey(): Promise<Buffer> {
  try {
    const { stdout } = await execFileAsync("security", [
      "find-generic-password",
      "-s", KEYCHAIN_SERVICE,
      "-a", KEYCHAIN_ACCOUNT,
      "-w",
    ]);
    return Buffer.from(stdout.trim(), "base64");
  } catch (err: any) {
    throw new Error(
      `Keychain entry '${KEYCHAIN_SERVICE}' not found. Run 'claude-secrets-setup' first.`
    );
  }
}

export async function setMasterKey(key: Buffer): Promise<void> {
  const b64 = key.toString("base64");
  await execFileAsync("security", [
    "add-generic-password",
    "-U",
    "-s", KEYCHAIN_SERVICE,
    "-a", KEYCHAIN_ACCOUNT,
    "-w", b64,
    "-T", "",
  ]);
}

export function generateKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decrypt(payload: string, key: Buffer): string {
  const [ivB64, tagB64, ctB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("Invalid ciphertext format");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}
