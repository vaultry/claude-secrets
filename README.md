# @vaultry/claude-secrets

[![npm version](https://img.shields.io/npm/v/@vaultry/claude-secrets.svg)](https://www.npmjs.com/package/@vaultry/claude-secrets)
[![npm downloads](https://img.shields.io/npm/dm/@vaultry/claude-secrets.svg)](https://www.npmjs.com/package/@vaultry/claude-secrets)
[![license](https://img.shields.io/badge/license-Source--available-blue.svg)](./LICENSE.md)
[![platform](https://img.shields.io/badge/platform-macOS-lightgrey.svg)](#requirements)
[![node](https://img.shields.io/node/v/@vaultry/claude-secrets.svg)](#requirements)

Secure token storage for Claude Code sessions and your shell/apps. Encrypted on disk, master key in macOS Keychain, per-project allowlist for Claude, unrestricted CLI access for you.

> **Stop pasting tokens into every new Claude session.** Store them once, reference them everywhere — including commit-safe `.env` files.

![Demo](./demo.gif)

## Quickstart

```bash
npm install -g @vaultry/claude-secrets
claude-secrets-setup                                  # generates master key in Keychain
claude mcp add claude-secrets --scope user -- claude-secrets-mcp

# Store a token:
echo "ghp_xxxxxx" | claude-secrets set GITHUB_TOKEN

# Use in .env (commit-safe — refs only, no values):
echo 'API_KEY=secret://GITHUB_TOKEN' > .env

# Run app with secrets injected:
claude-secrets exec -- pnpm dev
```

That's it. Full docs below.

## Table of Contents

- [Three interfaces](#three-interfaces)
- [Requirements](#requirements)
- [Install](#install-via-npm)
- [CLI reference](#1-cli--claude-secrets)
- [MCP for Claude Code](#2-mcp--for-claude-code)
- [Workflow examples](#3-workflow-examples)
- [Slash commands](#slash-commands-claude-code)
- [Security model](#security)
- [Troubleshooting](#troubleshooting)

## Three interfaces

1. **MCP server** — Claude Code sessions read/write via tools (policy-gated)
2. **CLI `claude-secrets`** — your shell, apps, scripts (no policy)
3. **`.env` placeholders** — `secret://NAME` refs, commit-safe

## Why

Stop pasting tokens (GITEA, GitHub, API keys, DB passwords) into every new Claude session. `.env` files become safe to commit (they contain only refs). The master key lives in the Keychain and syncs across Macs via iCloud Keychain.

## Requirements

- macOS (uses the `security` CLI for Keychain access)
- Node.js ≥ 18

## Install via npm

```bash
npm install -g @vaultry/claude-secrets

# One-time setup (generates master key + empty encrypted file):
claude-secrets-setup

# Register the MCP server with Claude Code:
claude mcp add claude-secrets --scope user -- claude-secrets-mcp
```

## Install from source

```bash
git clone https://github.com/vaultry/claude-secrets.git
cd claude-secrets
pnpm install
pnpm build
node dist/bin/setup.js
claude mcp add claude-secrets --scope user -- node $(pwd)/dist/index.js
ln -sf $(pwd)/dist/bin/cli.js ~/.local/bin/claude-secrets
```

## Architecture

```
~/.claude/
├── secrets.encrypted                   # AES-256-GCM, mode 0600
└── (when installed from source)
    └── mcp-servers/secrets/
        ├── src/
        │   ├── index.ts                # MCP server (stdio)
        │   ├── crypto.ts               # AES-256-GCM + Keychain I/O
        │   ├── store.ts                # read/write secrets.encrypted
        │   ├── policy.ts               # isAllowed() via secrets.yml
        │   ├── dotenv.ts               # .env parser + placeholder expansion
        │   └── bin/
        │       ├── setup.ts            # init CLI
        │       ├── session-hook.ts     # SessionStart hook
        │       └── cli.ts              # claude-secrets CLI
        └── dist/                       # compiled JS
```

**Encryption**
- Algorithm: AES-256-GCM (authenticated encryption, tamper detection)
- IV: 12 bytes, random per write
- Key: 32 bytes, stored in macOS Keychain under service `claude-secrets-mcp`, account `master-key`
- File format: `{iv_b64}:{authtag_b64}:{ciphertext_b64}`
- Decrypted payload: JSON object `{name: value}`
- Writes are atomic (write-to-temp + rename)

**Sync**: iCloud Keychain syncs the master key across Macs. You can sync `secrets.encrypted` yourself (Dropbox, iCloud Drive, git-crypt, etc.) — it's useless without the key.

---

## 1. CLI — `claude-secrets`

```
claude-secrets help

  get <name>                         Print secret to stdout
  set <name> [value]                 Store secret (value from stdin if not given)
  delete|rm <name>                   Delete a secret
  list|ls                            List all secret names (sorted)
  search <pattern>                   Regex search (case insensitive)

  export [--file .env]               Print 'export KEY=VAL' lines for shell eval
    [--format shell|dotenv|json]     Default: shell
    [--on-missing throw|empty|keep]  Default: throw

  exec [--file .env] -- <cmd...>     Run cmd with expanded env from .env
    [--on-missing throw|empty|keep]  Default: throw
```

### Managing secrets

```bash
# From stdin (safer — not in shell history):
echo "ghp_xxxxxx" | claude-secrets set GITHUB_TOKEN

# From 1Password:
op read "op://Private/Gitea/token" | claude-secrets set GITEA_TOKEN

# Interactive (type value, Ctrl-D):
claude-secrets set DB_PASSWORD

# Inline (VISIBLE in shell history — avoid for real secrets):
claude-secrets set TEST_VAR some-value

# Read:
claude-secrets get GITEA_TOKEN

# List + search:
claude-secrets list
claude-secrets search '^GITHUB'

# Delete:
claude-secrets rm OLD_TOKEN
```

### `.env` with placeholders

```bash
# .env (commit-safe — no real values)
API_KEY=secret://GITHUB_TOKEN
DB_URL=postgres://user:secret://DB_PASSWORD@db.host/myapp
PLAIN_VAR=no-secret-here
REDIS_HOST=localhost
```

Placeholder syntax: `secret://NAME` (URI-style, no conflict with bash parameter expansion). Names may contain `A-Z`, `0-9`, `_`, `.`, `-`.

### Load into shell

```bash
# Put all values in your current shell:
eval "$(claude-secrets export)"
echo $API_KEY                                    # resolved

# Different file:
eval "$(claude-secrets export --file .env.prod)"

# JSON for scripts:
claude-secrets export --format json > resolved.json

# Resolved dotenv for tools that don't understand refs:
claude-secrets export --format dotenv > .env.resolved
```

### Run a command with secrets

```bash
claude-secrets exec -- pnpm dev                  # secrets as env vars
claude-secrets exec -- node build.js
claude-secrets exec --file .env.staging -- npm run deploy

# Secrets exist only in the child process — not in parent shell env or history
```

### Missing-secret behavior

| `--on-missing` | Behavior |
|----------------|----------|
| `throw` (default) | Exit 1 with list of missing names |
| `empty` | Placeholder becomes an empty string |
| `keep` | Placeholder left literal (`secret://NAME`) |

---

## 2. MCP — for Claude Code

Available after a Claude session restart as `mcp__claude-secrets__*`:

| Tool | Input | Policy check | Effect |
|------|-------|--------------|--------|
| `set_secret` | `name`, `value` | yes | Store/overwrite (requires allowlist) |
| `get_secret` | `name` | yes | Returns value or `Denied` |
| `delete_secret` | `name` | yes | Removes or `Denied` |
| `list_secrets` | — | filter | `{total, visible, names}` |
| `search_secrets` | `pattern` (regex) | filter | Array of matches |

`list` and `search` only return names that pass the allowlist. `total` shows the real count so Claude knows more secrets exist but can't see their names.

### Policy — `.claude/secrets.yml`

Per project. Without this file: **all MCP reads and writes blocked** — prevents Claude in project A from accidentally reading or overwriting secrets from project B. The CLI bypasses policy (you as a user have full access).

```yaml
allow:
  - GITEA_TOKEN
  - GITHUB_*            # glob patterns supported
  - OP_SERVICE_*
```

Special values:

```yaml
allow: "*"              # allow everything (not recommended)
```

```yaml
allow:
  - GITEA_TOKEN
inject_values: true     # SessionStart hook also injects values
```

`secrets.yml` is safe to commit — it contains only names, no values.

### SessionStart Hook

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "claude-secrets-session-hook"
          }
        ]
      }
    ]
  }
}
```

Runs at each Claude Code session start with the project CWD:

- No `.claude/secrets.yml` → nothing injected
- With an allowlist → injects the names of visible secrets plus a hint to use `get_secret`
- With `inject_values: true` → also injects values into the system prompt (opt-in per project)

Values injected this way end up in transcripts, `history.jsonl`, plan files, and API logs. Only use this for short-lived tokens in trusted projects.

---

## 3. Workflow examples

### New project with Gitea + database

```bash
cd ~/projects/new-thing
git init

# Secrets already stored? Check:
claude-secrets search 'GITEA|DB'

# No? Add them:
op read "op://Private/Gitea/token" | claude-secrets set GITEA_TOKEN
claude-secrets set DB_PASSWORD              # type in, Ctrl-D

# Commit-safe .env:
cat > .env <<EOF
GITEA_TOKEN=secret://GITEA_TOKEN
DATABASE_URL=postgres://app:secret://DB_PASSWORD@localhost:5432/mydb
PORT=3000
EOF

# Give Claude access (optional — only if Claude needs to read tokens):
mkdir -p .claude
cat > .claude/secrets.yml <<EOF
allow:
  - GITEA_TOKEN
  - DB_PASSWORD
EOF

# Dev server with secrets injected:
claude-secrets exec -- pnpm dev
```

### package.json scripts

```json
{
  "scripts": {
    "dev": "claude-secrets exec -- ts-node src/index.ts",
    "test": "claude-secrets exec --file .env.test -- vitest",
    "deploy": "claude-secrets exec --file .env.prod -- node deploy.js"
  }
}
```

### Shell init (optional — default loading)

```bash
# ~/.zshrc
if [ -f .env ] && command -v claude-secrets &>/dev/null; then
  eval "$(claude-secrets export --on-missing keep 2>/dev/null)" 2>/dev/null
fi
```

---

## Slash commands (Claude Code)

Included in `commands/` and discoverable when installed in `~/.claude/commands/`:

- `/secret-set <NAME> [prompt]` — native macOS dialog (hidden input) → `claude-secrets set`
- `/secret-get <NAME>` — `claude-secrets get` → clipboard + notification, value never appears in chat

Symlink to make them available:

```bash
ln -sf $(npm root -g)/@vaultry/claude-secrets/commands/secret-set.md ~/.claude/commands/secret-set.md
ln -sf $(npm root -g)/@vaultry/claude-secrets/commands/secret-get.md ~/.claude/commands/secret-get.md
```

---

## Troubleshooting

**"Keychain entry not found"**
Setup wasn't run. Run `claude-secrets-setup`.

**"Invalid ciphertext format"**
`secrets.encrypted` is corrupt or was encrypted with a different key. Restore from backup or delete and start over.

**Keychain prompt on every read**
Normal on the first session after login. Check "Always Allow". If it keeps prompting: open Keychain Access → search `claude-secrets-mcp` → right-click → Access Control → add the `node` binary.

**`claude-secrets: command not found`**
`~/.local/bin` not on PATH (source install) or npm global bin not on PATH. Fix:
```bash
export PATH="$HOME/.local/bin:$(npm bin -g):$PATH"
```

**MCP not visible in Claude**
```bash
claude mcp list | grep claude-secrets      # should show "✓ Connected"
```
If not: restart the Claude session.

**Secret in `.env` but expansion fails**
Check: `claude-secrets get NAME` — does it exist? Name match is case-sensitive. Placeholder syntax must be exactly `secret://` (not `@secrets:` or `${secrets:}`).

**Logs**
MCP server errors go to stderr → `~/.claude/debug/` in Claude Code.

---

## Security

**Protects against**:
- Master key lives outside the encrypted file (in Keychain, user-locked)
- Per-project allowlist blocks cross-project leakage via Claude
- AES-256-GCM detects tampering
- File mode 0600 (owner-only)
- Atomic writes (write-to-temp + rename) — no partial-state corruption
- Placeholder refs in `.env` → commit-safe
- `exec --` pattern keeps secrets out of shell history and `ps` output

**Watch out for**:
- `inject_values: true` puts values in Claude's system prompt → they appear in transcripts, `history.jsonl`, plan files, and API logs
- The CLI bypasses policy — anyone with your user ID and an unlocked Mac can read all secrets (this is correct: Keychain is what protects you)
- Keychain ACL: after the first "Always Allow", `node` can read the key without a prompt
- MCP writes blocked without allowlist (since v0.1) — prevents cross-project overwrites

**Not a defense against**:
- Malicious local processes running as your user
- Physical access to an unlocked Mac
- A compromised Keychain (root-level malware)

---

## Uninstall

```bash
claude mcp remove claude-secrets --scope user
security delete-generic-password -s claude-secrets-mcp -a master-key
rm ~/.claude/secrets.encrypted
npm uninstall -g @vaultry/claude-secrets

# Remove the session-hook line from ~/.claude/settings.json manually
# Remove slash command symlinks if created:
rm -f ~/.claude/commands/secret-set.md ~/.claude/commands/secret-get.md
```

---

## License

Source-available under the **Vaultry Source-Available License v1.0**. Free for personal, educational, and internal use. Commercial use (resale, SaaS, bundled products) requires a separate commercial license — contact **mail@jorisslagter.nl**.

See `LICENSE.md` for full terms.
