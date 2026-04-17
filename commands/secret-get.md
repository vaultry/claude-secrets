---
description: Haal secret uit claude-secrets en kopieer naar clipboard (value nooit in chat)
allowed-tools: Bash
---

Haal een secret op uit de encrypted store en kopieer naar het macOS clipboard. De waarde verschijnt nooit in de chat, alleen een bevestigingsbericht.

## Gebruik

`/secret-get <NAAM>`

## Pattern

```bash
NAME="${ARGUMENTS}"
if [ -z "$NAME" ]; then echo "Usage: /secret-get <NAAM>"; exit 1; fi
if ! claude-secrets get "$NAME" 2>/dev/null | pbcopy; then
  echo "Secret '$NAME' niet gevonden"; exit 1
fi
osascript -e "display notification \"$NAME gekopieerd naar clipboard\" with title \"claude-secrets\""
echo "OK: '$NAME' staat nu in clipboard (plak met Cmd-V)"
```

## Voorbeelden

- `/secret-get GITEA_TOKEN` → waarde in clipboard, notificatie
- Handig wanneer je een token in een web formulier of andere app moet plakken

$ARGUMENTS — de secret naam
