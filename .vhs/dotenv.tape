Output ../docs/dotenv.gif

Set Shell "bash"
Set FontSize 18
Set Width 1200
Set Height 380
Set Theme "Catppuccin Mocha"
Set Padding 25
Set TypingSpeed 45ms

Hide
Type "cd /tmp && rm -rf vhs-dotenv && mkdir vhs-dotenv && cd vhs-dotenv && export PS1='$ ' && clear"
Enter
Sleep 300ms
Type `echo "ghp_demo_token_abc123" | claude-secrets set GITHUB_TOKEN > /dev/null 2>&1`
Enter
Sleep 300ms
Type "clear"
Enter
Sleep 200ms
Show

Type "# Commit-safe .env — placeholder references, no real values"
Enter
Sleep 600ms

Type `printf 'API_KEY=secret://GITHUB_TOKEN\nDB_URL=postgres://app:secret://GITHUB_TOKEN@db.local/app\nPORT=3000\n' > .env`
Enter
Sleep 800ms

Type "cat .env"
Enter
Sleep 3000ms

Hide
Type "claude-secrets rm GITHUB_TOKEN > /dev/null 2>&1"
Enter
