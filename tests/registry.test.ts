import { describe, expect, it } from 'vitest';
import {
  getProvider,
  isValidProvider,
  listProviders,
  type Provider,
  registerProvider,
} from '../src/index.js';

function createCustomProvider(name: string): Provider {
  return {
    config: {
      name,
      displayName: 'Custom Chat',
      url: 'https://chat.example.com',
      loginUrl: 'https://chat.example.com/login',
      defaultTimeoutMs: 30_000,
    },
    actions: {
      isLoggedIn: () => Promise.resolve(true),
      submitPrompt: () => Promise.resolve(),
      captureResponse: () =>
        Promise.resolve({
          text: 'Custom response',
          markdown: 'Custom response',
          truncated: false,
        }),
    },
  };
}

describe('Provider Registry', () => {
  it('should list all providers', () => {
    const providers = listProviders();
    expect(providers.slice(0, 8)).toEqual([
      'chatgpt',
      'gemini',
      'claude',
      'grok',
      'perplexity',
      'notebooklm',
      'flow',
      'dreamina',
    ]);
  });

  it('should get a provider by name', () => {
    const provider = getProvider('chatgpt');
    expect(provider.config.name).toBe('chatgpt');
    expect(provider.config.displayName).toBe('ChatGPT');
    expect(provider.config.url).toBe('https://chatgpt.com');
    expect(provider.actions).toBeDefined();
  });

  it('should throw for unknown provider', () => {
    expect(() => getProvider('unknown')).toThrow('Unknown provider');
    // Prototype pollution guard
    expect(() => getProvider('toString')).toThrow('Unknown provider');
    expect(() => getProvider('__proto__')).toThrow('Unknown provider');
  });

  it('should get grok provider by name', () => {
    const provider = getProvider('grok');
    expect(provider.config.name).toBe('grok');
    expect(provider.config.displayName).toBe('Grok');
    expect(provider.config.url).toBe('https://grok.com');
    expect(provider.actions).toBeDefined();
  });

  it('should get dreamina provider by name', () => {
    const provider = getProvider('dreamina');
    expect(provider.config.name).toBe('dreamina');
    expect(provider.config.displayName).toBe('Dreamina');
    expect(provider.config.url).toContain('dreamina.capcut.com');
    expect(provider.actions).toBeDefined();
  });

  it('should validate provider names', () => {
    expect(isValidProvider('chatgpt')).toBe(true);
    expect(isValidProvider('gemini')).toBe(true);
    expect(isValidProvider('claude')).toBe(true);
    expect(isValidProvider('grok')).toBe(true);
    expect(isValidProvider('perplexity')).toBe(true);
    expect(isValidProvider('notebooklm')).toBe(true);
    expect(isValidProvider('flow')).toBe(true);
    expect(isValidProvider('dreamina')).toBe(true);
    expect(isValidProvider('unknown')).toBe(false);
    expect(isValidProvider('')).toBe(false);
    // Prototype pollution guard
    expect(isValidProvider('toString')).toBe(false);
    expect(isValidProvider('__proto__')).toBe(false);
  });

  it('should register a custom provider through the public API', () => {
    const provider = createCustomProvider('custom-chat');

    registerProvider(provider);

    expect(isValidProvider('custom-chat')).toBe(true);
    expect(getProvider('custom-chat')).toBe(provider);
    expect(listProviders()).toContain('custom-chat');
  });

  it('should reject duplicate provider names', () => {
    const provider = createCustomProvider('duplicate-chat');
    registerProvider(provider);

    expect(() => registerProvider(provider)).toThrow('already registered');
    expect(() => registerProvider(createCustomProvider('chatgpt'))).toThrow('already registered');
  });

  it.each(['', '../escape', 'UPPER', 'space name', '-leading', 'trailing-'])(
    'should reject unsafe provider name %j',
    (name) => {
      expect(() => registerProvider(createCustomProvider(name))).toThrow('Invalid provider name');
      expect(isValidProvider(name)).toBe(false);
    },
  );
});
