# AGENTS.md — 10x-chat skills

This app contains agent skills and browser functions. It has no CLI or npm release.
Run app commands from this folder. Keep the Chrome extension separate.

| Path | Use |
|---|---|
| skills/10x-chat/SKILL.md | Router, setup, shared state contract |
| skills/10x-chat/bin/ | Run a browser function, open a tab, wait for a result |
| skills/10x-chat/references/ | Chat, parallel answers, debug, improvement |
| skills/10x-chat-*/SKILL.md | Provider steps or recovery steps |
| skills/10x-chat-*/js/ | Standalone browser function expressions |
| tests/fixtures/ | Small HTML pages for each provider |
| tests/js.test.ts | Browser function contracts and regression cases |
| tests/structure.test.ts | Skill names, paths, required files, syntax, line limits |

## Add a provider

1. Add a skills/10x-chat-NAME folder. Its SKILL.md frontmatter name must match
   the folder. Give description a clear trigger. Keep the skill at most 200 lines.
2. Add state, insert, send, and read JS helpers. Each file must be one function
   expression. It finds elements itself and returns JSON. No uid arguments.
3. For a model menu, add open-models, models, and pick-model JS helpers.
   NotebookLM has no model menu. Flow and Dreamina may add video helpers.
4. State returns exactly this shape:

   ```json
   {"provider":"name","url":"https://example.com","loggedIn":true,"composer":true,"generating":false,"model":null,"blocked":null,"blockedText":null}
   ```

   The booleans are required. model and blockedText are strings or null.
   blocked is null, captcha, verify, 2fa, consent, quota, upgrade, or other.
   Require login evidence. Check visible controls, not hidden fallback editors.
5. Add a small HTML fixture and JS tests. Test missing controls, login, streaming,
   blocked states, multiline insertion, final answer extraction, and locked models.
6. Add the provider to the router. Keep the router at most 90 lines. Link shared
   login, wait-user, and best-model skills. Document model ranking and Known quirks.
7. Paths in a provider skill are relative to its folder. Build absolute paths.
   Call the common shell helpers from the sibling 10x-chat folder.

## Checks

```bash
bun install
bun run typecheck && bun run lint && bun run test
bash -n skills/10x-chat/bin/*.sh
```

Fixtures check known selectors. Use the user's Chrome for a live selector check
when a task requests it. Keep login, consent, and human checks with the user.
