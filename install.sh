#!/usr/bin/env bash
# Claude Secrets — one-line installer
# Usage: curl -fsSL https://raw.githubusercontent.com/vaultry/claude-secrets/main/install.sh | bash
set -euo pipefail

PKG="@vaultry/claude-secrets"
BOLD=$(tput bold 2>/dev/null || true); RESET=$(tput sgr0 2>/dev/null || true)
GREEN=$(tput setaf 2 2>/dev/null || true); RED=$(tput setaf 1 2>/dev/null || true); YELLOW=$(tput setaf 3 2>/dev/null || true)

info()  { printf "%s➜%s %s\n" "$BOLD" "$RESET" "$*"; }
ok()    { printf "%s✓%s %s\n" "$GREEN" "$RESET" "$*"; }
warn()  { printf "%s!%s %s\n" "$YELLOW" "$RESET" "$*"; }
fail()  { printf "%s✗%s %s\n" "$RED" "$RESET" "$*" >&2; exit 1; }

# 1. Platform check
[[ "$(uname -s)" == "Darwin" ]] || fail "macOS only for v0.1 (detected: $(uname -s))"
ok "macOS detected"

# 2. Node check
if ! command -v node >/dev/null 2>&1; then
  fail "Node.js not found. Install via https://nodejs.org/ or 'brew install node'"
fi
NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  fail "Node.js >= 18 required (found: $(node -v))"
fi
ok "Node.js $(node -v)"

# 3. npm global install
info "Installing $PKG globally via npm..."
npm install -g "$PKG" || fail "npm install failed"
ok "Package installed"

# 4. Setup (Keychain + encrypted file)
info "Running setup (creates Keychain entry + empty secrets file)..."
claude-secrets-setup || fail "Setup failed"
ok "Setup complete"

# 5. MCP registration (if Claude Code CLI present)
if command -v claude >/dev/null 2>&1; then
  info "Registering MCP server with Claude Code..."
  if claude mcp list 2>/dev/null | grep -q "^claude-secrets:"; then
    warn "MCP 'claude-secrets' already registered — skipping"
  else
    claude mcp add claude-secrets --scope user -- claude-secrets-mcp \
      && ok "MCP registered" \
      || warn "MCP registration failed — register manually: claude mcp add claude-secrets --scope user -- claude-secrets-mcp"
  fi
else
  warn "Claude Code CLI ('claude') not found — skipping MCP registration"
  warn "To register later: claude mcp add claude-secrets --scope user -- claude-secrets-mcp"
fi

# 6. Slash commands (optional)
if [[ -d "$HOME/.claude/commands" ]]; then
  NPM_ROOT=$(npm root -g)
  CMD_DIR="$NPM_ROOT/$PKG/commands"
  if [[ -d "$CMD_DIR" ]]; then
    info "Linking slash commands..."
    ln -sf "$CMD_DIR/secret-set.md" "$HOME/.claude/commands/secret-set.md"
    ln -sf "$CMD_DIR/secret-get.md" "$HOME/.claude/commands/secret-get.md"
    ok "Slash commands /secret-set and /secret-get available"
  fi
fi

echo
echo "${BOLD}Done.${RESET} Next steps:"
echo "  • Store a secret:     echo 'ghp_xxx' | claude-secrets set GITHUB_TOKEN"
echo "  • Per-project access: mkdir -p .claude && echo 'allow: [GITHUB_TOKEN]' > .claude/secrets.yml"
echo "  • Use in .env:        echo 'API_KEY=secret://GITHUB_TOKEN' > .env"
echo "  • Run with secrets:   claude-secrets exec -- pnpm dev"
echo
echo "Docs: https://github.com/vaultry/claude-secrets"
