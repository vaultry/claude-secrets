#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  getSecret,
  setSecret,
  deleteSecret,
  listSecretNames,
  searchSecrets,
} from "./store.js";
import { isAllowed, allowedNames } from "./policy.js";

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
        if (value === undefined) return textResult(`Secret '${secretName}' bestaat niet`, true);
        return textResult(value);
      }
      case "set_secret": {
        const secretName = String(args?.name ?? "");
        const value = String(args?.value ?? "");
        if (!secretName) return textResult("name verplicht", true);
        const gate = await isAllowed(secretName, CWD);
        if (!gate.ok) return textResult(`Denied: ${gate.reason}`, true);
        await setSecret(secretName, value);
        return textResult(`OK: '${secretName}' opgeslagen`);
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
        return textResult(removed ? `OK: '${secretName}' verwijderd` : `'${secretName}' bestond niet`);
      }
      case "search_secrets": {
        const pattern = String(args?.pattern ?? "");
        const matches = await searchSecrets(pattern);
        const visible = await allowedNames(matches, CWD);
        return textResult(JSON.stringify(visible, null, 2));
      }
      default:
        return textResult(`Onbekende tool: ${name}`, true);
    }
  } catch (err: any) {
    return textResult(`Error: ${err.message ?? String(err)}`, true);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
