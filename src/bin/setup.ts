#!/usr/bin/env node
import { access, writeFile, chmod } from "node:fs/promises";
import { generateKey, setMasterKey, getMasterKey, encrypt } from "../crypto.js";
import { STORE_PATH } from "../store.js";

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function main() {
  console.error("Claude Secrets MCP — setup");

  let key: Buffer;
  try {
    key = await getMasterKey();
    console.error("Keychain entry gevonden — hergebruiken.");
  } catch {
    console.error("Nieuwe master key genereren...");
    key = generateKey();
    await setMasterKey(key);
    console.error("Key opgeslagen in Keychain als 'claude-secrets-mcp'.");
  }

  if (await exists(STORE_PATH)) {
    console.error(`Bestaand secrets bestand gevonden: ${STORE_PATH} — overslaan.`);
  } else {
    const payload = encrypt(JSON.stringify({}), key);
    await writeFile(STORE_PATH, payload, "utf8");
    await chmod(STORE_PATH, 0o600);
    console.error(`Leeg encrypted bestand aangemaakt: ${STORE_PATH}`);
  }

  console.error("\nKlaar. Voeg secrets toe via MCP tool set_secret of handmatig.");
  console.error("Maak per project .claude/secrets.yml aan met:");
  console.error("  allow:");
  console.error("    - GITEA_TOKEN");
  console.error("    - GITHUB_TOKEN");
}

main().catch((err) => {
  console.error("Setup mislukt:", err.message);
  process.exit(1);
});
