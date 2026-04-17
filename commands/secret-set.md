---
description: Store a secret via native macOS dialog (hidden input). Value never appears in chat.
allowed-tools: Bash
---

Store a secret in the encrypted store using a native macOS password dialog. The value never appears in chat or logs.

## Usage

`/secret-set <NAME>` or `/secret-set <NAME> <prompt text>`

## Pattern

```bash
NAME="${ARGUMENTS_FIRST_WORD}"
PROMPT="${ARGUMENTS_REST:-Paste value for $NAME:}"
if [ -z "$NAME" ]; then echo "Usage: /secret-set <NAME> [prompt]"; exit 1; fi
VAL=$(osascript -e "display dialog \"$PROMPT\" default answer \"\" with hidden answer buttons {\"OK\",\"Cancel\"} default button \"OK\"" -e 'text returned of result' 2>&1)
if [ $? -ne 0 ] || [ -z "$VAL" ]; then echo "Cancelled or empty value"; exit 1; fi
printf '%s' "$VAL" | claude-secrets set "$NAME"
unset VAL
```

## Examples

- `/secret-set GITEA_TOKEN` → dialog "Paste value for GITEA_TOKEN:"
- `/secret-set DB_PASSWORD Production database password` → custom prompt

The secret is encrypted and stored in `~/.claude/secrets.encrypted` with the master key from macOS Keychain.

$ARGUMENTS — first word is NAME, remainder is the optional prompt text
