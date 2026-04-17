#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  getSecret,
  setSecret,
  deleteSecret,
  listSecretNames,
  searchSecrets,
  readStore,
} from "../store.js";
import { resolveDotenvFile, expandPlaceholders } from "../dotenv.js";

const HELP = `claude-secrets — CLI voor encrypted secrets store

Subcommands:
  get <name>                    Print secret waarde naar stdout
  set <name> [value]            Store secret (value uit stdin als niet meegegeven)
  delete|rm <name>              Verwijder secret
  list|ls                       Lijst alle secret namen
  search <pattern>              Zoek op regex (case insensitive)

  export [--file .env]          Print 'export KEY=VAL' regels voor shell eval
    [--format shell|dotenv|json]   Default: shell
    [--on-missing throw|empty|keep] Default: throw

  exec [--file .env] -- <cmd...>   Run cmd met geëxpandeerde env uit .env
    [--on-missing throw|empty|keep] Default: throw

  help                          Dit scherm

Placeholder syntax in .env:
  API_KEY=secret://MY_SECRET_NAME
  DB_URL=postgres://user:secret://DB_PASS@host/db

Voorbeelden:
  claude-secrets set GITEA_TOKEN                        # waarde uit stdin
  op read "op://Private/Gitea/token" | claude-secrets set GITEA_TOKEN
  claude-secrets get GITEA_TOKEN
  eval "$(claude-secrets export)"                        # load .env in shell
  claude-secrets exec -- pnpm dev                        # run met secrets
  claude-secrets exec --file .env.prod -- node build.js
`;

function usage(code = 0): never {
  process.stderr.write(HELP);
  process.exit(code);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").trimEnd();
}

type ExportFormat = "shell" | "dotenv" | "json";
type OnMissing = "throw" | "empty" | "keep";

function parseFlags(argv: string[]): { flags: Record<string, string>; positional: string[]; tail: string[] } {
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  let tail: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") { tail = argv.slice(i + 1); break; }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else flags[a.slice(2)] = argv[++i] ?? "";
    } else positional.push(a);
  }
  return { flags, positional, tail };
}

function shellEscape(v: string): string {
  return `'${v.replace(/'/g, `'\\''`)}'`;
}

async function cmdGet(name: string) {
  const v = await getSecret(name);
  if (v === undefined) { process.stderr.write(`Secret '${name}' niet gevonden\n`); process.exit(1); }
  process.stdout.write(v);
  if (process.stdout.isTTY) process.stdout.write("\n");
}

async function cmdSet(name: string, value?: string) {
  let v = value;
  if (v === undefined) {
    if (process.stdin.isTTY) { process.stderr.write(`Typ waarde voor ${name} (Enter eindigt):\n`); }
    v = await readStdin();
  }
  if (!v) { process.stderr.write("Lege waarde geweigerd\n"); process.exit(1); }
  await setSecret(name, v);
  process.stderr.write(`OK: '${name}' opgeslagen\n`);
}

async function cmdDelete(name: string) {
  const removed = await deleteSecret(name);
  process.stderr.write(removed ? `OK: '${name}' verwijderd\n` : `'${name}' bestond niet\n`);
  if (!removed) process.exit(1);
}

async function cmdList() {
  const names = await listSecretNames();
  for (const n of names) process.stdout.write(n + "\n");
}

async function cmdSearch(pattern: string) {
  const matches = await searchSecrets(pattern);
  for (const n of matches) process.stdout.write(n + "\n");
}

async function cmdExport(flags: Record<string, string>) {
  const file = resolve(flags.file ?? ".env");
  const format = (flags.format ?? "shell") as ExportFormat;
  const onMissing = (flags["on-missing"] ?? "throw") as OnMissing;
  const store = await readStore();
  const { env, missing } = await resolveDotenvFile(file, store, onMissing);
  if (missing.length && onMissing === "throw") {
    process.stderr.write(`Missing secrets: ${missing.join(", ")}\n`);
    process.exit(1);
  }
  if (format === "shell") {
    for (const [k, v] of Object.entries(env)) process.stdout.write(`export ${k}=${shellEscape(v)}\n`);
  } else if (format === "dotenv") {
    for (const [k, v] of Object.entries(env)) process.stdout.write(`${k}=${v}\n`);
  } else if (format === "json") {
    process.stdout.write(JSON.stringify(env, null, 2) + "\n");
  } else { process.stderr.write(`Onbekend format: ${format}\n`); process.exit(1); }
}

async function cmdExec(flags: Record<string, string>, tail: string[]) {
  if (tail.length === 0) { process.stderr.write("Geen command opgegeven na --\n"); process.exit(1); }
  const file = resolve(flags.file ?? ".env");
  const onMissing = (flags["on-missing"] ?? "throw") as OnMissing;
  const store = await readStore();
  let env: Record<string, string> = {};
  let missing: string[] = [];
  try {
    const resolved = await resolveDotenvFile(file, store, onMissing);
    env = resolved.env; missing = resolved.missing;
  } catch (err: any) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    process.stderr.write(`Warning: ${file} niet gevonden — run zonder .env expansie\n`);
  }
  if (missing.length && onMissing === "throw") {
    process.stderr.write(`Missing secrets: ${missing.join(", ")}\n`);
    process.exit(1);
  }
  const [cmd, ...args] = tail;
  const child = spawn(cmd, args, {
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  child.on("exit", (code) => process.exit(code ?? 0));
  child.on("error", (err) => { process.stderr.write(`Exec error: ${err.message}\n`); process.exit(1); });
}

async function main() {
  const [sub, ...rest] = process.argv.slice(2);
  if (!sub || sub === "help" || sub === "--help" || sub === "-h") usage(0);
  const { flags, positional, tail } = parseFlags(rest);

  switch (sub) {
    case "get":
      if (!positional[0]) usage(1);
      await cmdGet(positional[0]); break;
    case "set":
      if (!positional[0]) usage(1);
      await cmdSet(positional[0], positional[1]); break;
    case "delete": case "rm":
      if (!positional[0]) usage(1);
      await cmdDelete(positional[0]); break;
    case "list": case "ls":
      await cmdList(); break;
    case "search":
      if (!positional[0]) usage(1);
      await cmdSearch(positional[0]); break;
    case "export":
      await cmdExport(flags); break;
    case "exec":
      await cmdExec(flags, tail); break;
    default:
      process.stderr.write(`Onbekend subcommand: ${sub}\n`);
      usage(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message ?? String(err)}\n`);
  process.exit(1);
});
