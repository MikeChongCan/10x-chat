import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const providers = [
  'gemini',
  'chatgpt',
  'claude',
  'grok',
  'perplexity',
  'notebooklm',
  'flow',
  'dreamina',
];
const models: Record<string, string> = {
  gemini: '4 Argon',
  chatgpt: 'Thinking',
  claude: 'Opus',
  grok: 'Heavy',
  perplexity: 'Sonar Pro',
  flow: 'Veo 3.1 - Quality',
  dreamina: 'Seedance 2.0',
};
let win: Window;
function run(provider: string, file: string, arg?: unknown) {
  const src = readFileSync(`skills/10x-chat-${provider}/js/${file}.js`, 'utf8');
  return new Function(`return ${src}`)()(arg);
}
function setup(provider: string) {
  win = new Window({ url: `https://${provider}.example/` });
  win.document.write(readFileSync(`tests/fixtures/${provider}/ready.html`, 'utf8'));
  for (const key of [
    'window',
    'document',
    'location',
    'HTMLElement',
    'HTMLTextAreaElement',
    'HTMLInputElement',
    'sessionStorage',
  ]) {
    vi.stubGlobal(key, key === 'window' ? win : (win as unknown as Record<string, unknown>)[key]);
  }
  vi.stubGlobal('getComputedStyle', win.getComputedStyle.bind(win));
  vi.stubGlobal('getSelection', win.getSelection.bind(win));
  // happy-dom has no editing engine. Emulate only execCommand here. Assert its
  // calls below, so a textContent assignment cannot pass the insertion test.
  Object.defineProperty(win.document, 'execCommand', {
    value: vi.fn((command: string, _ui: boolean, value: string) => {
      if (command === 'insertText') {
        const ed = win.document.activeElement as unknown as HTMLElement;
        if (ed.tagName === 'TEXTAREA') (ed as HTMLTextAreaElement).value = value;
        else {
          ed.replaceChildren(
            ...(value.split('\n').map((line) => {
              const block = win.document.createElement('div');
              block.textContent = line;
              return block;
            }) as unknown as Node[]),
          );
        }
        ed.dispatchEvent(new win.Event('input', { bubbles: true }) as unknown as Event);
      }
      return true;
    }),
  });
}
afterEach(() => {
  win?.happyDOM.abort();
  vi.unstubAllGlobals();
});

for (const provider of providers) {
  describe(provider, () => {
    beforeEach(() => setup(provider));
    it('returns the exact state contract', () => {
      const state = run(provider, 'state');
      expect(Object.keys(state).sort()).toEqual(
        [
          'provider',
          'url',
          'loggedIn',
          'composer',
          'generating',
          'model',
          'blocked',
          'blockedText',
        ].sort(),
      );
      expect(state).toEqual({
        provider,
        url: `https://${provider}.example/`,
        loggedIn: true,
        composer: true,
        generating: false,
        model: models[provider] ?? null,
        blocked: null,
        blockedText: null,
      });
    });
    it('inserts the whole multiline prompt without sending', () => {
      const clicked = vi.fn();
      win.document.addEventListener('click', clicked);
      const prompt = 'Line one\nLine two "quoted"\nLine three 😀';
      expect(run(provider, 'insert', { text: prompt })).toEqual({ ok: true, len: prompt.length });
      expect((win.document as unknown as Document).execCommand).toHaveBeenNthCalledWith(
        1,
        'selectAll',
        false,
      );
      expect((win.document as unknown as Document).execCommand).toHaveBeenNthCalledWith(
        2,
        'insertText',
        false,
        prompt,
      );
      expect(clicked).not.toHaveBeenCalled();
      const active = win.document.activeElement;
      expect(active?.getAttribute('data-placeholder')).not.toBe('Upload reference');
      expect(
        (active as unknown as HTMLTextAreaElement).value ??
          (active as unknown as HTMLElement)?.innerText,
      ).toBe(prompt);
    });
    it('sends once and rejects disabled send controls', () => {
      const clicked = vi.fn();
      win.document.addEventListener('click', clicked);
      expect(run(provider, 'send')).toEqual({ ok: true });
      expect(clicked).toHaveBeenCalledTimes(1);
      win.document.querySelectorAll('button').forEach((button) => {
        button.disabled = true;
      });
      expect(run(provider, 'send')).toEqual({ ok: false });
      expect(clicked).toHaveBeenCalledTimes(1);
    });
    it('recognizes generation and ignores hidden stop controls', () => {
      win.document.body.insertAdjacentHTML(
        'beforeend',
        '<button aria-label="Stop generating">Stop</button>',
      );
      expect(run(provider, 'state').generating).toBe(true);
      win.document.querySelector('[aria-label="Stop generating"]')?.setAttribute('hidden', '');
      expect(run(provider, 'state').generating).toBe(false);
    });
    it.each([
      ['captcha', 'Captcha challenge'],
      ['verify', 'Verify you are human'],
      ['2fa', 'Verification code'],
      ['consent', 'Cookie consent'],
      ['quota', 'Quota limit reached'],
      ['upgrade', 'Upgrade plan'],
      ['other', 'Permission needed'],
    ])('reports %s', (blocked, text) => {
      win.document.body.insertAdjacentHTML('beforeend', `<div role="dialog">${text}</div>`);
      expect(run(provider, 'state')).toMatchObject({ blocked, blockedText: text });
    });
    it('ignores controls inside a hidden parent', () => {
      win.document.body.insertAdjacentHTML(
        'beforeend',
        '<div style="display:none"><button aria-label="Stop generating">Stop</button><button>Sign in</button></div>',
      );
      expect(run(provider, 'state')).toMatchObject({ generating: false, loggedIn: true });
    });
    it('detects signed-out and missing controls', () => {
      win.document.body.insertAdjacentHTML('beforeend', '<button>Sign in</button>');
      expect(run(provider, 'state').loggedIn).toBe(false);
      win.document.body.innerHTML = '';
      expect(run(provider, 'state')).toMatchObject({ composer: false, loggedIn: false });
      expect(run(provider, 'insert', { text: 'test' })).toEqual({ ok: false, len: 0 });
      expect(run(provider, 'send')).toEqual({ ok: false });
      expect(run(provider, 'read')).toMatchObject({ text: '', images: [], links: [] });
    });
    it('extracts the last answer and source/media arrays', () => {
      const answer = run(provider, 'read');
      expect(answer.images).toBeInstanceOf(Array);
      expect(answer.links).toBeInstanceOf(Array);
      if (!['flow', 'dreamina'].includes(provider)) {
        expect(answer.text).toBe('Final answerSource');
        expect(answer.images).toEqual(['https://example.com/image.png']);
        expect(answer.links).toEqual(['https://example.com/source']);
      } else expect(answer.videos).toEqual([]);
    });
    if (provider !== 'notebooklm') {
      it('opens the model menu, lists labels, selects a model and skips locks', () => {
        expect(run(provider, 'open-models')).toEqual({ ok: true });
        expect(run(provider, 'models')).toContain(models[provider]);
        expect(run(provider, 'models')).toContain('Ultra locked [locked]');
        expect(run(provider, 'pick-model', { name: models[provider].toUpperCase() })).toEqual({
          ok: true,
          picked: models[provider],
        });
        expect(run(provider, 'pick-model', { name: 'Ultra locked' })).toEqual({
          ok: false,
          picked: null,
        });
        expect(run(provider, 'pick-model', { name: 'not present' })).toEqual({
          ok: false,
          picked: null,
        });
        win.document.body.innerHTML = '';
        expect(run(provider, 'open-models')).toEqual({ ok: false });
        expect(run(provider, 'models')).toEqual([]);
      });
    }
  });
}

describe('provider regressions', () => {
  it('ignores an empty screen-reader alert', () => {
    for (const provider of providers) {
      setup(provider);
      win.document.body.insertAdjacentHTML(
        'beforeend',
        '<span class="sr-only" role="alert" aria-live="assertive"></span>',
      );
      expect(run(provider, 'state').blocked, provider).toBeNull();
    }
  });
  it('reads the 2026 ChatGPT MarkdownRoot answer and Send button', () => {
    setup('chatgpt');
    win.document.body.insertAdjacentHTML(
      'beforeend',
      '<div class="MarkdownRoot-rZKhxa"><p>New answer</p></div>',
    );
    expect(run('chatgpt', 'read').text).toBe('New answer');
    for (const el of win.document.querySelectorAll(
      '#composer-submit-button, [data-testid="send-button"], button[aria-label="Send prompt"]',
    ))
      el.remove();
    win.document.body.insertAdjacentHTML('beforeend', '<button aria-label="Send">Send</button>');
    expect(run('chatgpt', 'send')).toEqual({ ok: true });
  });
  it('reads only the Claude markdown and the model label', () => {
    setup('claude');
    win.document.body.insertAdjacentHTML(
      'beforeend',
      '<div data-testid="assistant-message">Claude responded: X<div class="standard-markdown">Only this</div><span>just now</span></div><button aria-label="More options for AI video editing models"></button>',
    );
    expect(run('claude', 'read').text).toBe('Only this');
  });
  it('reads only the Grok response markdown', () => {
    setup('grok');
    win.document.body.insertAdjacentHTML(
      'beforeend',
      '<div class="message-bubble"><h2 class="sr-only">Grok</h2><div class="response-content-markdown">Only this</div></div>',
    );
    expect(run('grok', 'read').text).toBe('Only this');
  });
  it('counts answers so a follow-up can skip the old one', () => {
    for (const provider of providers) {
      setup(provider);
      expect(typeof run(provider, 'read').count, provider).toBe('number');
    }
  });
  it('matches Gemini Flash without confusing Flash-Lite', () => {
    setup('gemini');
    expect(run('gemini', 'pick-model', { name: 'Flash' })).toEqual({
      ok: true,
      picked: '3.8 Flash',
    });
  });
  it('keeps legacy Gemini aliases', () => {
    setup('gemini');
    expect(run('gemini', 'pick-model', { name: 'Fast' }).picked).toBe('3.5 Flash-Lite');
    expect(run('gemini', 'pick-model', { name: 'Thinking' }).picked).toBe('3.8 Flash');
  });
  it('reports a ChatGPT overlay', () => {
    setup('chatgpt');
    win.document.body.insertAdjacentHTML(
      'beforeend',
      '<div id="modal-no-auth-login">Not now</div>',
    );
    expect(run('chatgpt', 'state')).toMatchObject({ blocked: 'other', blockedText: 'Not now' });
  });
  it('opens the combined Dreamina aspect/resolution control', () => {
    setup('dreamina');
    expect(run('dreamina', 'open-aspect')).toEqual({ ok: true });
  });
  it('requires positive Dreamina login evidence', () => {
    setup('dreamina');
    win.document.querySelector('#SiderMenuCredit')?.remove();
    win.document.body.insertAdjacentHTML(
      'beforeend',
      '<img class="avatar" src="https://example.com/avatar">',
    );
    expect(run('dreamina', 'state').loggedIn).toBe(false);
  });
  it('rejects Dreamina wrapper-disabled models', () => {
    setup('dreamina');
    win.document.body.insertAdjacentHTML(
      'beforeend',
      '<div class="lv-select-option-wrapper-disabled"><div class="lv-select-option">Seedance 1.5 Pro</div></div>',
    );
    expect(run('dreamina', 'models')).toContain('Seedance 1.5 Pro [locked]');
    expect(run('dreamina', 'pick-model', { name: 'Seedance 1.5 Pro' }).ok).toBe(false);
  });
  it('reads only a new Dreamina result with the submitted prompt', () => {
    setup('dreamina');
    run('dreamina', 'insert', { text: 'A bird flies' });
    win.document.body.insertAdjacentHTML(
      'beforeend',
      '<article>A bird flies<div class="responsive-video-grid"><video src="https://cdn.example/video/old.mp4"></video></div></article>',
    );
    run('dreamina', 'send');
    win.document.body.insertAdjacentHTML(
      'beforeend',
      '<article>A different prompt<div class="responsive-video-grid"><video src="https://cdn.example/video/wrong.mp4"></video></div></article><article>A bird flies<div class="responsive-video-grid"><video src="https://capcutstatic.com/capcut-web-login-static/spinner.mp4"></video></div></article>',
    );
    expect(run('dreamina', 'read').videos).toEqual([]);
    win.document.body.insertAdjacentHTML(
      'beforeend',
      '<article>A bird flies<div class="responsive-video-grid"><video src="https://cdn.example/video/new.mp4"></video></div></article>',
    );
    delete (win as unknown as { __tenxRequest?: unknown }).__tenxRequest;
    expect(run('dreamina', 'read').videos).toEqual(['https://cdn.example/video/new.mp4']);
  });
  it('excludes existing Flow video URLs', () => {
    setup('flow');
    win.document.body.insertAdjacentHTML(
      'beforeend',
      '<video src="https://example.com/old.mp4"></video>',
    );
    run('flow', 'send');
    win.document.body.insertAdjacentHTML(
      'beforeend',
      '<video src="https://example.com/new.mp4"></video>',
    );
    expect(run('flow', 'read').videos).toEqual(['https://example.com/new.mp4']);
  });
});

describe('shell contracts', () => {
  it('checks all helper shell syntax', () => {
    for (const file of ['js', 'open', 'wait']) {
      execFileSync('bash', ['-n', `skills/10x-chat/bin/${file}.sh`]);
    }
  });
  it('rejects invalid page IDs before invoking the browser', () => {
    for (const file of ['js', 'wait']) {
      expect(
        spawnSync('bash', [
          `skills/10x-chat/bin/${file}.sh`,
          'invalid',
          resolve('skills/10x-chat-gemini'),
        ]).status,
      ).toBe(2);
    }
  });
});

// Exercise the real shell scripts with a local mcporter stub. No browser calls.
describe('shell transport and polling', () => {
  let temp: string;
  let env: NodeJS.ProcessEnv;
  beforeEach(() => {
    temp = mkdtempSync(join(tmpdir(), '10x-chat-shell-'));
    const mock = `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.includes('chrome-existing.new_page')) {
  process.stdout.write('1: https://old.example\\n27: https://new.example [selected]\\n');
} else {
  const request = JSON.parse(args[args.indexOf('--args') + 1]);
  if (process.env.MOCK_TRANSPORT === 'eval') {
    const value = new Function('return ' + request.function)()();
    const fence = String.fromCharCode(96).repeat(3);
    const text = 'Script ran on page and returned:\\n' + fence + 'json\\n' + JSON.stringify(value) + '\\n' + fence;
    process.stdout.write(JSON.stringify({content:[{type:'text', text}]}));
  } else {
    const countFile = process.env.MOCK_COUNT;
    let count = Number(fs.existsSync(countFile) ? fs.readFileSync(countFile, 'utf8') : 0);
    const isState = request.function.includes('blockedText');
    if (isState) fs.writeFileSync(countFile, String(++count));
    const mode = process.env.MOCK_TRANSPORT;
    const value = isState ? { loggedIn: mode !== 'login', blocked: mode === 'blocked' ? 'quota' : null, generating: mode === 'timeout' || (mode === 'reset' && count === 3), blockedText: null } : {count: 1, text: mode === 'empty' ? '' : 'Final answer', images: [], links: []};
    process.stdout.write(JSON.stringify(value));
  }
}
`;
    writeFileSync(join(temp, 'bunx'), mock, { mode: 0o755 });
    writeFileSync(join(temp, 'sleep'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
    env = { ...process.env, PATH: `${temp}:${process.env.PATH}`, MOCK_COUNT: join(temp, 'count') };
  });
  afterEach(() => rmSync(temp, { recursive: true, force: true }));
  function shell(name: string, args: string[], mode: string, extra: NodeJS.ProcessEnv = {}) {
    return spawnSync('bash', [`skills/10x-chat/bin/${name}.sh`, ...args], {
      env: { ...env, MOCK_TRANSPORT: mode, ...extra },
      encoding: 'utf8',
      timeout: 10000,
    });
  }
  it('sends file text with default null and decodes fenced MCP content', () => {
    const file = join(temp, 'function.js');
    writeFileSync(file, '(arg) => ({ ok: true, arg });\n');
    const result = shell('js', ['27', file], 'eval');
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, arg: null });
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Check literal input, not code.
    const arg = { text: 'one\ntwo "quoted" \n`literal` ${notCode}', files: [] };
    const withArg = shell('js', ['27', file, JSON.stringify(arg)], 'eval');
    expect(withArg.status, withArg.stderr).toBe(0);
    expect(JSON.parse(withArg.stdout)).toEqual({ ok: true, arg });
  });
  it('opens a page and prints only the selected ID', () => {
    const result = shell('open', ['https://new.example'], 'eval');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('27\n');
  });
  it.each([
    ['blocked', 3],
    ['login', 4],
    ['timeout', 124],
    ['empty', 124],
  ])('returns %s exit code', (mode, code) => {
    const result = shell('wait', ['27', resolve('skills/10x-chat-gemini'), '1'], String(mode));
    expect(result.status, result.stderr).toBe(code);
    if (code !== 124) expect(JSON.parse(result.stdout)).toHaveProperty('loggedIn');
  });
  it('waits past the previous answer with MIN_COUNT', () => {
    const gemini = resolve('skills/10x-chat-gemini');
    expect(shell('wait', ['27', gemini, '1'], 'stable', { MIN_COUNT: '2' }).status).toBe(124);
    const ok = shell('wait', ['27', gemini, '10'], 'stable', { MIN_COUNT: '1' });
    expect(ok.status, ok.stderr).toBe(0);
    expect(shell('wait', ['27', gemini, '1'], 'stable', { MIN_COUNT: 'x' }).status).toBe(2);
  });
  it('requires two stable polls and resets stability during generation', () => {
    const result = shell('wait', ['27', resolve('skills/10x-chat-gemini'), '10'], 'reset');
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).text).toBe('Final answer');
    expect(Number(readFileSync(join(temp, 'count'), 'utf8'))).toBe(5);
  });
});
