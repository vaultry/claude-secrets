Output demo.gif

Set Shell "bash"
Set FontSize 18
Set Width 1400
Set Height 820
Set Theme "Dracula"
Set Padding 30
Set TypingSpeed 40ms
Set PlaybackSpeed 1.0

Hide
Type "cd /tmp && rm -rf vhs-demo && mkdir vhs-demo && cd vhs-demo && export PS1='$ ' && clear"
Enter
Sleep 500ms
Show

Type "# Store a token — stdin keeps value out of shell history"
Sleep 800ms
Enter
Type `echo "ghp_demo_token_abc123xyz" | claude-secrets set DEMO_TOKEN`
Enter
Sleep 1500ms

Type "# Commit-safe .env with placeholder references"
Sleep 800ms
Enter
Type `echo 'API_KEY=secret://DEMO_TOKEN' > .env && cat .env`
Enter
Sleep 1500ms

Type "# Expand placeholders for shell eval"
Sleep 800ms
Enter
Type "claude-secrets export"
Enter
Sleep 2000ms

Type "# Or run a command with secrets injected directly"
Sleep 800ms
Enter
Type `claude-secrets exec -- sh -c 'echo "API_KEY is $API_KEY"'`
Enter
Sleep 2500ms

Type "# Policy-gated per project for Claude Code (not shown: MCP tools)"
Sleep 800ms
Enter
Sleep 1500ms

Hide
Type "claude-secrets rm DEMO_TOKEN > /dev/null 2>&1"
Enter
Sleep 300ms
