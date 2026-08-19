import { describe, expect, it, vi } from 'vitest';
import { ensureChatMode } from '../src/providers/chatgpt.js';

type Mode = 'Chat' | 'Work';

function createModePage(
  options: { active?: Mode; visible?: Mode[]; switchOnClick?: boolean } = {},
) {
  let active = options.active;
  const visible = new Set(options.visible ?? ['Chat', 'Work']);
  const switchOnClick = options.switchOnClick ?? true;
  const clicks: Mode[] = [];

  return {
    page: {
      evaluate: vi.fn(async (callback: unknown) => {
        if (String(callback).includes('chat.click()')) {
          clicks.push('Chat');
          if (switchOnClick) active = 'Chat';
          return true;
        }
        return {
          chatVisible: visible.has('Chat'),
          workVisible: visible.has('Work'),
          chatActive: visible.has('Chat') && active === 'Chat',
          workActive: visible.has('Work') && active === 'Work',
        };
      }),
      waitForTimeout: vi.fn(async () => {}),
    },
    clicks,
    active: () => active,
  };
}

describe('ChatGPT mode selection', () => {
  it('switches a persisted Work session to Chat and verifies the state', async () => {
    const { page, clicks, active } = createModePage({ active: 'Work' });

    await ensureChatMode(page as never);

    expect(clicks).toEqual(['Chat']);
    expect(active()).toBe('Chat');
  });

  it('does not click when Chat is already active', async () => {
    const { page, clicks } = createModePage({ active: 'Chat' });

    await ensureChatMode(page as never);

    expect(clicks).toEqual([]);
  });

  it('preserves compatibility for accounts without the mode switcher', async () => {
    const { page, clicks } = createModePage({ visible: [] });

    await ensureChatMode(page as never);

    expect(clicks).toEqual([]);
  });

  it('fails closed when Work is available but Chat cannot be selected', async () => {
    const { page } = createModePage({ active: 'Work', switchOnClick: false });

    await expect(ensureChatMode(page as never)).rejects.toThrow(
      'Could not switch ChatGPT from Work to Chat mode',
    );
  });
});
