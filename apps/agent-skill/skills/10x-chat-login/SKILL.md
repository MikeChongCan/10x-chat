---
name: 10x-chat-login
description: Recover a provider session when state.loggedIn is false. Ask the user to log in in their own Chrome and wait for the shared state check.
---

# Login

Inputs: `PAGE`, absolute `PROVIDER` folder, and its site URL.
Set `ROUTER` to the sibling `10x-chat` folder.

1. Tell the user which site needs login. Google login covers Gemini, NotebookLM, and Flow.
2. Bring the tab forward:

   ```bash
   "$ROUTER/bin/page.sh" select "$PAGE"
   ```

3. The user enters credentials and codes. Never type or read credentials.
4. Every 5 seconds, run the following check. Stop after 5 minutes.

   ```bash
   "$ROUTER/bin/js.sh" "$PAGE" "$PROVIDER/js/state.js"
   ```

5. If blocked, load [wait-user](../10x-chat-wait-user/SKILL.md).
   If logged in, return to the provider steps. Recheck the composer.
6. At 5 minutes, report the login timeout and stop. Do not send a prompt.
