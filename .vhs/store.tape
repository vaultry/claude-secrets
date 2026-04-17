Output ../docs/store.gif

Set Shell "bash"
Set FontSize 18
Set Width 1200
Set Height 340
Set Theme "Catppuccin Mocha"
Set Padding 25
Set TypingSpeed 45ms

Hide
Type "cd /tmp && rm -rf vhs-store && mkdir vhs-store && cd vhs-store && export PS1='$ ' && clear"
Enter
Sleep 500ms
Show

Type "# Store a token (stdin — stays out of shell history)"
Enter
Sleep 600ms

Type `echo "ghp_demo_token_abc123" | claude-secrets set GITHUB_TOKEN`
Enter
Sleep 1500ms

Type "claude-secrets list"
Enter
Sleep 2000ms

Hide
Type "claude-secrets rm GITHUB_TOKEN > /dev/null 2>&1"
Enter
