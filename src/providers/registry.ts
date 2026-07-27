import type { BuiltInProviderName, Provider, ProviderName } from '../types.js';
import { CHATGPT_CONFIG, chatgptActions } from './chatgpt.js';
import { CLAUDE_CONFIG, claudeActions } from './claude.js';
import { DREAMINA_CONFIG, dreaminaActions } from './dreamina.js';
import { FLOW_CONFIG, flowActions } from './flow.js';
import { GEMINI_CONFIG, geminiActions } from './gemini.js';
import { GROK_CONFIG, grokActions } from './grok.js';
import { NOTEBOOKLM_CONFIG, notebooklmActions } from './notebooklm.js';
import { PERPLEXITY_CONFIG, perplexityActions } from './perplexity.js';

const BUILT_IN_PROVIDERS = {
  chatgpt: { config: CHATGPT_CONFIG, actions: chatgptActions },
  gemini: { config: GEMINI_CONFIG, actions: geminiActions },
  claude: { config: CLAUDE_CONFIG, actions: claudeActions },
  grok: { config: GROK_CONFIG, actions: grokActions },
  perplexity: { config: PERPLEXITY_CONFIG, actions: perplexityActions },
  notebooklm: { config: NOTEBOOKLM_CONFIG, actions: notebooklmActions },
  flow: { config: FLOW_CONFIG, actions: flowActions },
  dreamina: { config: DREAMINA_CONFIG, actions: dreaminaActions },
} satisfies Record<BuiltInProviderName, Provider>;

const PROVIDERS = new Map<ProviderName, Provider>(
  Object.values(BUILT_IN_PROVIDERS).map((provider) => [provider.config.name, provider] as const),
);

const PROVIDER_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/**
 * Register an out-of-tree provider for the lifetime of the current process.
 *
 * Provider names become CLI/profile slugs, so they are restricted to safe,
 * lowercase path components. Existing providers cannot be overwritten.
 */
export function registerProvider(provider: Provider): void {
  const name = provider?.config?.name;
  if (typeof name !== 'string' || !PROVIDER_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid provider name "${String(name)}". Use 1-64 lowercase letters, numbers, or hyphens, starting and ending with a letter or number.`,
    );
  }
  if (PROVIDERS.has(name)) {
    throw new Error(`Provider "${name}" is already registered`);
  }
  PROVIDERS.set(name, provider);
}

/** Get a provider by name, throws if not found. */
export function getProvider(name: string): Provider {
  const provider = PROVIDERS.get(name);
  if (!provider) {
    const available = listProviders().join(', ');
    throw new Error(`Unknown provider "${name}". Available: ${available}`);
  }
  return provider;
}

/** List all registered provider names. */
export function listProviders(): ProviderName[] {
  return [...PROVIDERS.keys()];
}

/** Check if a string is a valid provider name. */
export function isValidProvider(name: string): name is ProviderName {
  return PROVIDERS.has(name);
}
