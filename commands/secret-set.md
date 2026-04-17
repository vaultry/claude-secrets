---
description: Store een secret in claude-secrets via native macOS dialog (hidden input)
allowed-tools: Bash
---

Sla een secret op in de encrypted store via een native macOS wachtwoord-dialoog. De waarde verschijnt nooit in de chat of logs.

## Gebruik

`/secret-set <NAAM>` of `/secret-set <NAAM> <prompt tekst>`

## Pattern

```bash
NAME="${ARGUMENTS_FIRST_WORD}"
PROMPT="${ARGUMENTS_REST:-Plak waarde voor $NAME:}"
if [ -z "$NAME" ]; then echo "Usage: /secret-set <NAAM> [prompt]"; exit 1; fi
VAL=$(osascript -e "display dialog \"$PROMPT\" default answer \"\" with hidden answer buttons {\"OK\",\"Cancel\"} default button \"OK\"" -e 'text returned of result' 2>&1)
if [ $? -ne 0 ] || [ -z "$VAL" ]; then echo "Geannuleerd of lege waarde"; exit 1; fi
printf '%s' "$VAL" | claude-secrets set "$NAME"
unset VAL
```

## Voorbeelden

- `/secret-set GITEA_TOKEN` → dialog "Plak waarde voor GITEA_TOKEN:"
- `/secret-set DB_PASSWORD Database wachtwoord voor productie` → custom prompt

De secret wordt encrypted opgeslagen in `~/.claude/secrets.encrypted` met master key uit macOS Keychain.

$ARGUMENTS — eerste woord is NAAM, rest is optionele prompt tekst
