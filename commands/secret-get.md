---
description: Fetch a secret from claude-secrets into the macOS clipboard (value never appears in chat)
allowed-tools: Bash
---

Fetch a secret from the encrypted store and copy it to the macOS clipboard. The value never appears in chat — only a confirmation message.

## Usage

`/secret-get <NAME>`

## Pattern

```bash
NAME="${ARGUMENTS}"
if [ -z "$NAME" ]; then echo "Usage: /secret-get <NAME>"; exit 1; fi
if ! claude-secrets get "$NAME" 2>/dev/null | pbcopy; then
  echo "Secret '$NAME' not found"; exit 1
fi
osascript -e "display notification \"$NAME copied to clipboard\" with title \"claude-secrets\""
echo "OK: '$NAME' is in clipboard (paste with Cmd-V)"
```

## Examples

- `/secret-get GITEA_TOKEN` → value in clipboard, notification
- Useful when pasting a token into a web form or another app

$ARGUMENTS — the secret name
