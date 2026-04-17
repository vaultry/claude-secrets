Output ../docs/exec.gif

Set Shell "bash"
Set FontSize 18
Set Width 1200
Set Height 340
Set Theme "Catppuccin Mocha"
Set Padding 25
Set TypingSpeed 45ms

Hide
Type "cd /tmp && rm -rf vhs-exec && mkdir vhs-exec && cd vhs-exec && export PS1='$ ' && clear"
Enter
Sleep 300ms
Type `echo "ghp_demo_token_abc123" | claude-secrets set GITHUB_TOKEN > /dev/null 2>&1`
Enter
Type `printf 'API_KEY=secret://GITHUB_TOKEN\n' > .env`
Enter
Type "clear"
Enter
Sleep 200ms
Show

Type "# Run a command with .env secrets injected into its env"
Enter
Sleep 800ms

Type `claude-secrets exec -- sh -c 'echo "My API key is $API_KEY"'`
Enter
Sleep 2500ms

Hide
Type "claude-secrets rm GITHUB_TOKEN > /dev/null 2>&1"
Enter
