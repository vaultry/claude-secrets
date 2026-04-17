#!/usr/bin/env node
import { access, writeFile, chmod } from "node:fs/promises";
import { generateKey, setMasterKey, getMasterKey, encrypt } from "../crypto.js";
import { STORE_PATH } from "../store.js";

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function main() {
  console.error("claude-secrets — setup");

  let key: Buffer;
  try {
    key = await getMasterKey();
    console.error("Existing Keychain entry found — reusing.");
  } catch {
    console.error("Generating new master key...");
    key = generateKey();
    await setMasterKey(key);
    console.error("Key stored in Keychain as 'claude-secrets-mcp'.");
  }

  if (await exists(STORE_PATH)) {
    console.error(`Existing secrets file found: ${STORE_PATH} — skipping.`);
  } else {
    const payload = encrypt(JSON.stringify({}), key);
    await writeFile(STORE_PATH, payload, { encoding: "utf8", mode: 0o600 });
    await chmod(STORE_PATH, 0o600);
    console.error(`Created empty encrypted store: ${STORE_PATH}`);
  }

  console.error("\nDone. Add secrets via the MCP tool set_secret or the CLI.");
  console.error("Create a per-project .claude/secrets.yml to grant Claude access:");
  console.error("  allow:");
  console.error("    - GITEA_TOKEN");
  console.error("    - GITHUB_TOKEN");
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
