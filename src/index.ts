#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  getSecret,
  setSecret,
  deleteSecret,
  listSecretNames,
  searchSecrets,
} from "./store.js";
import { isAllowed, allowedNames } from "./policy.js";

const execFileAsync = promisify(execFile);

async function promptForSecretViaDialog(prompt: string): Promise<string | null> {
  const script = `display dialog "${prompt.replace(/"/g, '\\"')}" default answer "" with hidden answer buttons {"Cancel", "OK"} default button "OK"\nreturn text returned of result`;
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script]);
    return stdout.trimEnd();
  } catch {
    return null;
  }
}

const CWD = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const server = new Server(
  { name: "claude-secrets", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_secret",
      description: "Read a secret value by name. Requires name to be whitelisted in project .claude/secrets.yml.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string", description: "Secret name" } },
        required: ["name"],
      },
    },
    {
      name: "set_secret",
      description: "Store a secret value. Creates or overwrites. Requires name to be whitelisted in project .claude/secrets.yml.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          value: { type: "string" },
        },
        required: ["name", "value"],
      },
    },
    {
      name: "list_secrets",
      description: "List secret names visible to current project (filtered by .claude/secrets.yml allowlist).",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "delete_secret",
      description: "Delete a secret by name. Requires allowlist.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
    {
      name: "search_secrets",
      description: "Search secret names by regex pattern (case insensitive). Filtered by allowlist.",
      inputSchema: {
        type: "object",
        properties: { pattern: { type: "string" } },
        required: ["pattern"],
      },
    },
    {
      name: "input_secret",
      description: "Prompt the user for a secret value via a native macOS dialog (hidden input), then store it. The value never passes through the model or the chat — it goes directly from the user's dialog into the encrypted store. Use this when you need a token, password, or API key the user has not yet stored. Requires name to be whitelisted in project .claude/secrets.yml.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Secret name to store under" },
          prompt: { type: "string", description: "Text shown in the dialog (e.g. 'Paste your GitHub token:')" },
        },
        required: ["name"],
      },
    },
  ],
}));

function textResult(text: string, isError = false) {
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    switch (name) {
      case "get_secret": {
        const secretName = String(args?.name ?? "");
        const gate = await isAllowed(secretName, CWD);
        if (!gate.ok) return textResult(`Denied: ${gate.reason}`, true);
        const value = await getSecret(secretName);
        if (value === undefined) return textResult(`Secret '${secretName}' not found`, true);
        return textResult(value);
      }
      case "set_secret": {
        const secretName = String(args?.name ?? "");
        const value = String(args?.value ?? "");
        if (!secretName) return textResult("name is required", true);
        const gate = await isAllowed(secretName, CWD);
        if (!gate.ok) return textResult(`Denied: ${gate.reason}`, true);
        await setSecret(secretName, value);
        return textResult(`OK: '${secretName}' stored`);
      }
      case "list_secrets": {
        const all = await listSecretNames();
        const visible = await allowedNames(all, CWD);
        return textResult(JSON.stringify({ total: all.length, visible: visible.length, names: visible }, null, 2));
      }
      case "delete_secret": {
        const secretName = String(args?.name ?? "");
        const gate = await isAllowed(secretName, CWD);
        if (!gate.ok) return textResult(`Denied: ${gate.reason}`, true);
        const removed = await deleteSecret(secretName);
        return textResult(removed ? `OK: '${secretName}' removed` : `'${secretName}' did not exist`);
      }
      case "search_secrets": {
        const pattern = String(args?.pattern ?? "");
        const matches = await searchSecrets(pattern);
        const visible = await allowedNames(matches, CWD);
        return textResult(JSON.stringify(visible, null, 2));
      }
      case "input_secret": {
        const secretName = String(args?.name ?? "");
        const promptText = String(args?.prompt ?? `Paste value for ${secretName}:`);
        if (!secretName) return textResult("name is required", true);
        const gate = await isAllowed(secretName, CWD);
        if (!gate.ok) return textResult(`Denied: ${gate.reason}`, true);
        const value = await promptForSecretViaDialog(promptText);
        if (value === null) return textResult("User cancelled the dialog", true);
        if (!value) return textResult("Empty value rejected", true);
        await setSecret(secretName, value);
        return textResult(`OK: '${secretName}' stored via dialog (value never passed through model)`);
      }
      default:
        return textResult(`Unknown tool: ${name}`, true);
    }
  } catch (err: any) {
    return textResult(`Error: ${err.message ?? String(err)}`, true);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
