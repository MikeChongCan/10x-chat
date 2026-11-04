# Parallel answers

1. Choose N providers from the request. Load each provider skill.
2. Use the [chat procedure](chat.md) for each provider with the same prompt and files.
3. Open one tab per provider. Keep a provider-to-pageId map. Run independent
   insert, send, and wait calls as parallel shell jobs. Keep outputs separate.
4. Handle login or blocks per provider. Continue the other jobs. Do not reuse a
   page ID for a different provider. Page IDs are `t<tabId>` (bridge) or
   numbers (CDP). Never mix them; convert with `bin/cdp-id.sh` only for CDP tools. Report each timeout or failed provider.
5. Label each answer with provider and selected model. Preserve source URLs.
6. Diarize the answers: list agreement, disagreement, and unique claims per model.
   Distinguish missing coverage from disagreement. Cite the source model for
   each unique claim. Check conflicting factual claims before drawing a conclusion.
