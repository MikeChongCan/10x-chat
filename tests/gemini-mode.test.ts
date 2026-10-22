import { describe, expect, it, vi } from 'vitest';
import {
  GEMINI_CONFIG,
  geminiActions,
  geminiModeKey,
  matchesGeminiMode,
} from '../src/providers/gemini.js';

describe('geminiModeKey', () => {
  it('strips version numbers and the Gemini prefix', () => {
    expect(geminiModeKey('4 Argon')).toBe('argon');
    expect(geminiModeKey('Gemini 4 Argon')).toBe('argon');
    expect(geminiModeKey('3.5 Flash-Lite')).toBe('flash lite');
    expect(geminiModeKey('3.8 Flash')).toBe('flash');
    expect(geminiModeKey('3.1 Pro')).toBe('pro');
  });

  it('maps legacy aliases', () => {
    expect(geminiModeKey('Fast')).toBe('flash lite');
    expect(geminiModeKey('Thinking')).toBe('flash');
  });
});

describe('matchesGeminiMode', () => {
  it('matches current menu labels by name', () => {
    expect(matchesGeminiMode('4 Argon', 'Argon')).toBe(true);
    expect(matchesGeminiMode('4 Argon', 'argon')).toBe(true);
    expect(matchesGeminiMode('3.8 Flash', '3.5 Flash')).toBe(true);
    expect(matchesGeminiMode('3.1 Pro', 'Pro')).toBe(true);
    expect(matchesGeminiMode('3.5 Flash-Lite', 'Fast')).toBe(true);
  });

  it('does not confuse Flash with Flash-Lite', () => {
    expect(matchesGeminiMode('3.5 Flash-Lite', 'Flash')).toBe(false);
    expect(matchesGeminiMode('3.8 Flash', 'Flash-Lite')).toBe(false);
    expect(matchesGeminiMode('3.8 Flash', 'Thinking')).toBe(true);
  });

  it('lists Argon as a model', () => {
    expect(GEMINI_CONFIG.models).toContain('Argon');
  });
});

describe('geminiActions.selectModel', () => {
  it('clicks the 4 Argon option when the picker shows another mode', async () => {
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({ found: true, text: 'Flash' }) // picker state
      .mockResolvedValueOnce(true) // open picker
      .mockResolvedValueOnce(['3.5 Flash-Lite', '3.8 Flash', '3.1 Pro', '4 Argon']) // labels
      .mockResolvedValueOnce(true); // click
    const page = {
      evaluate,
      waitForTimeout: vi.fn(async () => {}),
      keyboard: { press: vi.fn(async () => {}) },
      locator: vi.fn(),
    };
    await geminiActions.selectModel?.(page as never, 'Argon');
    expect(evaluate).toHaveBeenCalledTimes(4);
    expect(evaluate.mock.calls[3]?.[1]).toBe(3);
  });

  it('does nothing when Argon is already selected', async () => {
    const evaluate = vi.fn().mockResolvedValueOnce({ found: true, text: 'Argon' });
    const page = { evaluate, waitForTimeout: vi.fn(async () => {}) };
    await geminiActions.selectModel?.(page as never, 'Argon');
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
});
