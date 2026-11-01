# Keep a lesson

1. Confirm the new behavior in the DOM. Record the failed assumption.
2. Add one short rule to the provider SKILL.md Known quirks section. State the
   trigger, the action, and the check that proves success. Remove a stale rule.
3. Add a small HTML fixture under the provider's tests/fixtures folder. Remove
   account details, tokens, and private prompts. Include the changed selector.
4. Add an assertion in tests/js.test.ts that fails before the fix and passes
   after it. Use tests/structure.test.ts for skill layout or path rules.
5. From apps/agent-skill, run:

   ```bash
   bun run typecheck && bun run lint && bun run test
   bash -n skills/10x-chat/bin/*.sh
   ```

6. Keep the lesson in the provider skill. Shared lessons belong in the router
   references only when they affect more than one provider.
