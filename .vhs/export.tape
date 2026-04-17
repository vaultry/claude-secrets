Output ../docs/export.gif

Set Shell "bash"
Set FontSize 18
Set Width 1200
Set Height 420
Set Theme "Catppuccin Mocha"
Set Padding 25
Set TypingSpeed 45ms

Hide
Type "cd /tmp && rm -rf vhs-export && mkdir vhs-export && cd vhs-export && export PS1='$ ' && clear"
Enter
Sleep 300ms
Type `echo "ghp_demo_token_abc123" | claude-secrets set GITHUB_TOKEN > /dev/null 2>&1`
Enter
Type `printf 'API_KEY=secret://GITHUB_TOKEN\nPORT=3000\n' > .env`
Enter
Type "clear"
Enter
Sleep 200ms
Show

Type "cat .env"
Enter
Sleep 1500ms

Type "# Expand placeholders — shell eval format"
Enter
Sleep 500ms
Type "claude-secrets export"
Enter
Sleep 2500ms

Type "# Or JSON for scripts"
Enter
Sleep 500ms
Type "claude-secrets export --format json"
Enter
Sleep 2500ms

Hide
Type "claude-secrets rm GITHUB_TOKEN > /dev/null 2>&1"
Enter
