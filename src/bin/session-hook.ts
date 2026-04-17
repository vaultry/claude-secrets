#!/usr/bin/env node
import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { listSecretNames, readStore } from "../store.js";
import { allowedNames } from "../policy.js";

type Policy = {
  allow?: string[] | "*";
  inject_values?: boolean;
};

async function loadPolicy(cwd: string): Promise<Policy | null> {
  const path = join(cwd, ".claude", "secrets.yml");
  try { await access(path); } catch { return null; }
  return parseYaml(await readFile(path, "utf8")) as Policy;
}

function emit(obj: unknown) {
  process.stdout.write(JSON.stringify(obj));
}

async function main() {
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const policy = await loadPolicy(cwd);
  if (!policy) { emit({}); return; }

  let context = "";
  try {
    const allNames = await listSecretNames();
    const visible = await allowedNames(allNames, cwd);
    if (visible.length === 0) { emit({}); return; }

    if (policy.inject_values) {
      const store = await readStore();
      const lines = visible.map((n) => `- ${n}: ${store[n]}`).join("\n");
      context = [
        "WARNING: inject_values=true — secret VALUES below are injected into the model context.",
        "These values will appear in transcripts, history.jsonl, plan files, and API logs.",
        "Disable inject_values in .claude/secrets.yml to only expose names.",
        "",
        "Available secrets (values):",
        lines,
      ].join("\n");
    } else {
      context = [
        "Available secrets via MCP (use mcp__claude-secrets__get_secret to read):",
        ...visible.map((n) => `- ${n}`),
      ].join("\n");
    }
  } catch (err: any) {
    context = `Secrets hook error: ${err.message}`;
  }

  emit({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: context,
    },
  });
}

main().catch((err) => {
  process.stderr.write(`session-hook failed: ${err.message}\n`);
  process.exit(0);
});
