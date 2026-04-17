# Claude Secrets

Veilige token opslag voor Claude Code sessies én je shell/apps. Encrypted op disk, key in macOS Keychain, per-project allowlist voor Claude, vrije CLI toegang voor jou.

Drie ingangen:
1. **MCP server** — Claude Code sessies lezen/schrijven via tools (policy-gated)
2. **CLI `claude-secrets`** — jouw shell, apps, scripts (geen policy)
3. **`.env` placeholders** — `secret://NAME` refs, commit-safe

## Waarom

Voorkomt dat tokens (GITEA, GitHub, API keys, DB passwords) telkens opnieuw geplakt moeten worden. `.env` bestanden kunnen in git zonder lek (bevatten alleen refs). Master key in Keychain, synct over iCloud.

## Architectuur

```
~/.claude/
├── secrets.encrypted                  # AES-256-GCM, mode 0600
└── mcp-servers/secrets/
    ├── src/
    │   ├── index.ts                   # MCP server (stdio)
    │   ├── crypto.ts                  # AES-256-GCM + Keychain I/O
    │   ├── store.ts                   # read/write secrets.encrypted
    │   ├── policy.ts                  # isAllowed() via secrets.yml
    │   ├── dotenv.ts                  # .env parser + placeholder expand
    │   └── bin/
    │       ├── setup.ts               # init CLI
    │       ├── session-hook.ts        # SessionStart hook
    │       └── cli.ts                 # claude-secrets CLI
    └── dist/                          # compiled JS

~/.local/bin/claude-secrets            # symlink naar dist/bin/cli.js
```

**Encryptie**
- Algoritme: AES-256-GCM (authenticated encryption, tamper detection)
- IV: 12 bytes, random per write
- Key: 32 bytes, in macOS Keychain onder service `claude-secrets-mcp`, account `master-key`
- Bestandsformaat: `{iv_b64}:{authtag_b64}:{ciphertext_b64}`
- Payload na decrypt: JSON object `{name: value}`

**Syncing**: iCloud Keychain synct de master key tussen Macs. `secrets.encrypted` kun je zelf syncen (Dropbox, iCloud Drive, git-crypt, etc.) — zonder key is hij onbruikbaar.

## Requirements

- macOS (gebruikt `security` CLI voor Keychain)
- Node.js ≥ 18

## Install via npm

```bash
npm install -g @vaultry/claude-secrets

# Eenmalige setup (Keychain entry + leeg encrypted bestand):
claude-secrets-setup

# Registreer MCP bij Claude Code:
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

## SessionStart Hook (optioneel)

Voor auto-injection van secret namen bij sessie start — voeg toe aan `~/.claude/settings.json`:

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

(Command is beschikbaar na `npm install -g`. Voor source install: vervang door pad naar `dist/bin/session-hook.js`.)

---

## 1. CLI — `claude-secrets`

```
claude-secrets help

  get <name>                         Print secret naar stdout
  set <name> [value]                 Store (value uit stdin als niet meegegeven)
  delete|rm <name>                   Verwijder
  list|ls                            Alle namen (gesorteerd)
  search <pattern>                   Regex zoeken (case insensitive)

  export [--file .env]               'export KEY=VAL' regels voor shell eval
    [--format shell|dotenv|json]     Default: shell
    [--on-missing throw|empty|keep]  Default: throw

  exec [--file .env] -- <cmd...>     Run cmd met geëxpandeerde env
    [--on-missing throw|empty|keep]  Default: throw
```

### Secrets beheren

```bash
# Uit stdin (safer — niet in shell history):
echo "ghp_xxxxxx" | claude-secrets set GITHUB_TOKEN

# Uit 1Password:
op read "op://Private/Gitea/token" | claude-secrets set GITEA_TOKEN

# Interactief (tikt waarde, Ctrl-D):
claude-secrets set DB_PASSWORD

# Inline (ZICHTBAAR in shell history — vermijd voor echte secrets):
claude-secrets set TEST_VAR some-value

# Lezen:
claude-secrets get GITEA_TOKEN

# Lijst + zoeken:
claude-secrets list
claude-secrets search '^GITHUB'

# Verwijderen:
claude-secrets rm OLD_TOKEN
```

### `.env` met placeholders

```bash
# .env (commit-safe — geen echte waarden)
API_KEY=secret://GITHUB_TOKEN
DB_URL=postgres://user:secret://DB_PASSWORD@db.host/myapp
PLAIN_VAR=no-secret-here
REDIS_HOST=localhost
```

Placeholder syntax: `secret://NAME` (URI-style, geen bash parameter-expansion conflict). Namen mogen `A-Z`, `0-9`, `_`, `.`, `-`.

### Load in shell

```bash
# Alles in je huidige shell zetten:
eval "$(claude-secrets export)"
echo $API_KEY                                    # resolved

# Andere file:
eval "$(claude-secrets export --file .env.prod)"

# JSON voor scripts:
claude-secrets export --format json > resolved.json

# dotenv (resolved) voor tools die geen refs begrijpen:
claude-secrets export --format dotenv > .env.resolved
```

### Run command met secrets

```bash
claude-secrets exec -- pnpm dev                  # secrets als env vars
claude-secrets exec -- node build.js
claude-secrets exec --file .env.staging -- npm run deploy

# Secrets blijven alleen in child process — niet in parent shell env of history
```

### Missing-secret gedrag

| `--on-missing` | Gedrag |
|----------------|--------|
| `throw` (default) | Exit 1 met lijst van missing namen |
| `empty` | Placeholder wordt lege string |
| `keep` | Placeholder blijft letterlijk staan (`secret://NAME`) |

---

## 2. MCP — voor Claude Code

Na Claude sessie herstart beschikbaar als `mcp__claude-secrets__*`:

| Tool | Input | Policy check | Effect |
|------|-------|--------------|--------|
| `set_secret` | `name`, `value` | ja | Store/overwrite (vereist allowlist) |
| `get_secret` | `name` | ja | Return value of `Denied` |
| `delete_secret` | `name` | ja | Remove of `Denied` |
| `list_secrets` | — | filter | `{total, visible, names}` |
| `search_secrets` | `pattern` (regex) | filter | Array met matches |

`list`/`search` tonen alleen namen die door de allowlist heen komen. `total` geeft het echte aantal (Claude weet dat er meer is, maar niet welke namen).

### Policy — `.claude/secrets.yml`

Per project. Zonder bestand: **alle reads én writes via MCP geblokkeerd** — voorkomt dat Claude in project A per ongeluk secrets van project B leest of overschrijft. CLI bypasst policy (jij als user hebt volledige toegang).

```yaml
allow:
  - GITEA_TOKEN
  - GITHUB_*            # glob patterns ondersteund
  - OP_SERVICE_*
```

Speciale waarden:

```yaml
allow: "*"              # alles toegestaan (niet aangeraden)
```

```yaml
allow:
  - GITEA_TOKEN
inject_values: true     # SessionStart hook injecteert ook waarden
```

`secrets.yml` veilig om te committen — bevat alleen namen, geen waarden.

### SessionStart Hook

Geregistreerd in `~/.claude/settings.json`. Draait bij elke Claude Code sessie start met project CWD:

- Geen `.claude/secrets.yml` → niets injecteren
- Met allowlist → injecteert namen van beschikbare secrets + hint om `get_secret` te gebruiken
- Met `inject_values: true` → injecteert ook waarden in system prompt (opt-in per project)

Values injecteren belandt in transcripts, `history.jsonl`, plan files. Alleen gebruiken waar echt nodig (bv. short-lived dev tokens in trusted projects).

---

## 3. Workflow voorbeelden

### Nieuw project met Gitea + database

```bash
cd ~/projects/new-thing
git init

# Secrets al in store? Check:
claude-secrets search 'GITEA|DB'

# Nog niet? Voeg toe:
op read "op://Private/Gitea/token" | claude-secrets set GITEA_TOKEN
claude-secrets set DB_PASSWORD              # typ in, Ctrl-D

# .env committen-safe:
cat > .env <<EOF
GITEA_TOKEN=secret://GITEA_TOKEN
DATABASE_URL=postgres://app:secret://DB_PASSWORD@localhost:5432/mydb
PORT=3000
EOF

# Claude toegang (optioneel — alleen als Claude tokens moet lezen):
mkdir -p .claude
cat > .claude/secrets.yml <<EOF
allow:
  - GITEA_TOKEN
  - DB_PASSWORD
EOF

# Dev server met secrets:
claude-secrets exec -- pnpm dev
```

### Package.json scripts

```json
{
  "scripts": {
    "dev": "claude-secrets exec -- ts-node src/index.ts",
    "test": "claude-secrets exec --file .env.test -- vitest",
    "deploy": "claude-secrets exec --file .env.prod -- node deploy.js"
  }
}
```

### Shell init (optioneel — voor default loading)

```bash
# ~/.zshrc
if [ -f .env ] && command -v claude-secrets &>/dev/null; then
  eval "$(claude-secrets export --on-missing keep 2>/dev/null)" 2>/dev/null
fi
```

---

## Troubleshooting

**"Keychain entry niet gevonden"**
Setup niet gedraaid. Run `node ~/.claude/mcp-servers/secrets/dist/bin/setup.js`.

**"Ongeldig ciphertext formaat"**
`secrets.encrypted` corrupt of met andere key versleuteld. Restore van backup of delete + opnieuw beginnen.

**Keychain prompt bij elke read**
Normaal bij eerste sessie na login. Vink "Always Allow" aan. Als herhalend: Keychain Access app → zoek `claude-secrets-mcp` → rechtermuis → Access Control → voeg `node` binary toe.

**"claude-secrets: command not found"**
`~/.local/bin` niet in PATH, of symlink weg. Fix:
```bash
ln -sf ~/.claude/mcp-servers/secrets/dist/bin/cli.js ~/.local/bin/claude-secrets
```

**MCP niet zichtbaar in Claude**
```bash
claude mcp list | grep claude-secrets      # moet "✓ Connected" tonen
```
Zo niet: Claude sessie herstarten.

**Secret in `.env` maar expansie faalt**
Check: `claude-secrets get NAME` — bestaat? Naam match case-sensitive. Placeholder syntax exact `secret://` (niet `@secrets:` of `${secrets:}`).

**Logs**
MCP server errors naar stderr → `~/.claude/debug/` in Claude Code.

---

## Beveiliging

**Wel veilig**:
- Master key buiten encrypted bestand (in Keychain, user-locked)
- Per-project allowlist blokkeert cross-project lekkage via Claude
- AES-256-GCM detecteert tampering
- File mode 0600 (alleen owner)
- Placeholder refs in `.env` = commit-safe
- `exec --` pattern houdt secrets uit shell history en `ps` output

**Let op**:
- `inject_values: true` zet waarden in Claude system prompt → belandt in transcripts en history
- CLI bypasst policy — iedereen met jouw user ID + unlocked Mac kan alle secrets lezen (correct gedrag, dat's wat Keychain beschermt)
- Keychain ACL: na eerste "Always Allow" kan `node` waarde zonder prompt lezen
- MCP writes geblokkeerd zonder allowlist (sinds v0.1) — voorkomt cross-project overwrites

**Niet tegen bedoeld**:
- Malicious lokale processen draaiend als jouw user
- Fysieke toegang tot unlocked Mac
- Compromised Keychain (root-level malware)

---

## Uninstall

```bash
claude mcp remove claude-secrets --scope user
security delete-generic-password -s claude-secrets-mcp -a master-key
rm ~/.claude/secrets.encrypted
rm ~/.local/bin/claude-secrets
rm -rf ~/.claude/mcp-servers/secrets

# settings.json: verwijder regel met session-hook.js uit SessionStart hooks
```
