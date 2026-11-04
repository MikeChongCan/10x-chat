---
name: 10x-chat-wait-user
description: Handle state.blocked for captcha, human checks, 2FA, consent, quota, upgrade, or permissions. Notify the user and wait for the block to clear.
---

# Wait for the user

Inputs: `PAGE`, absolute `PROVIDER` folder, and state JSON.
Set `ROUTER` to the sibling `10x-chat` folder.

1. Tell the user the site, `blocked`, and `blockedText`.
2. Bring the tab forward:

   ```bash
   "$ROUTER/bin/page.sh" select "$PAGE"
   ```

3. For quota, suggest another provider or a lower model. Let the user choose.
   For upgrade, let the user decide. Do not buy access or accept terms for them.
4. Let the user handle the check, consent, permission, or code in Chrome.
5. Poll every 5 seconds for at most 10 minutes:

   ```bash
   "$ROUTER/bin/js.sh" "$PAGE" "$PROVIDER/js/state.js"
   ```

6. When `blocked=null`, check login. If false, load [login](../10x-chat-login/SKILL.md).
   Otherwise resume the interrupted step. Check the page before resending.
7. At the limit, report the block and stop. Preserve the page for the user.
