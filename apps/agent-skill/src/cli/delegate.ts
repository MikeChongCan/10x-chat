import { stdin as input, stdout as output } from 'node:process';
import readline from 'node:readline';
import { Command } from 'commander';
import { launchBrowser } from '../browser/index.js';
import { resolveHeadlessMode } from '../browser/mode.js';
import { loadConfig } from '../config.js';
import { resolveAttachPaths } from '../core/files.js';
import { getProvider, isValidProvider, listProviders } from '../providers/index.js';
import type { CapturedResponse, ProviderName } from '../types.js';

type DelegateAction =
  | 'status'
  | 'goto'
  | 'selectModel'
  | 'attach'
  | 'submit'
  | 'capture'
  | 'chat'
  | 'eval'
  | 'close';

interface DelegateRequest {
  id?: string | number;
  action?: DelegateAction;
  url?: string;
  model?: string;
  files?: string[];
  prompt?: string;
  timeoutMs?: number;
  script?: string;
}

interface DelegateResponse {
  ok: boolean;
  id?: string | number;
  action?: string;
  provider?: ProviderName;
  url?: string;
  title?: string;
  loggedIn?: boolean;
  result?: unknown;
  response?: CapturedResponse;
  error?: string;
}

function writeJsonLine(payload: DelegateResponse): void {
  output.write(`${JSON.stringify(payload)}\n`);
}

function parseRequest(line: string): DelegateRequest {
  const parsed = JSON.parse(line) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object');
  }
  return parsed as DelegateRequest;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required string field: ${name}`);
  }
  return value;
}

function requireStringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new Error(`Missing required string[] field: ${name}`);
  }
  return value as string[];
}

async function capture(
  providerName: ProviderName,
  timeoutMs: number,
  page: Parameters<ReturnType<typeof getProvider>['actions']['isLoggedIn']>[0],
) {
  const provider = getProvider(providerName);
  return provider.actions.captureResponse(page, { timeoutMs });
}

export function createDelegateCommand(): Command {
  const cmd = new Command('delegate')
    .description('Start a provider-specific JSONL delegate for multi-step external AI control')
    .argument('<provider>', `Provider to delegate (${listProviders().join(', ')})`)
    .option('--model <model>', 'Select a model/mode after opening')
    .option('--headed', 'Force a visible browser window')
    .option('--timeout <ms>', 'Default capture timeout in ms', (value) => Number(value))
    .option('--isolated-profile', 'Use per-provider browser profile (backward compat)')
    .option('--no-login-check', 'Do not fail startup when provider is not logged in')
    .action(
      async (
        providerArg: string,
        options: {
          model?: string;
          headed?: boolean;
          timeout?: number;
          isolatedProfile?: boolean;
          loginCheck?: boolean;
        },
      ) => {
        if (!isValidProvider(providerArg)) {
          throw new Error(
            `Unknown provider: ${providerArg}. Available: ${listProviders().join(', ')}`,
          );
        }

        const providerName = providerArg;
        const config = await loadConfig();
        const provider = getProvider(providerName);
        const timeoutMs = Number.isFinite(options.timeout)
          ? Number(options.timeout)
          : provider.config.defaultTimeoutMs || config.defaultTimeoutMs;
        const headless = resolveHeadlessMode(
          providerName,
          config.headless,
          options.headed === true,
        );
        const profileMode = options.isolatedProfile ? 'isolated' : config.profileMode;

        const browser = await launchBrowser({
          provider: providerName,
          headless,
          url: provider.config.url,
          profileMode,
        });

        let closing = false;
        const close = async () => {
          if (closing) return;
          closing = true;
          await browser.close().catch(() => {});
        };

        process.once('SIGINT', () => {
          void close().finally(() => process.exit(130));
        });
        process.once('SIGTERM', () => {
          void close().finally(() => process.exit(143));
        });

        try {
          const loggedIn = await provider.actions.isLoggedIn(browser.page);
          if (!loggedIn && options.loginCheck !== false) {
            writeJsonLine({
              ok: false,
              provider: providerName,
              error: `Not logged in to ${provider.config.displayName}. Run: 10x-chat login ${providerName}`,
            });
            await close();
            process.exit(1);
          }

          if (options.model && provider.actions.selectModel) {
            await provider.actions.selectModel(browser.page, options.model);
          }

          writeJsonLine({
            ok: true,
            action: 'ready',
            provider: providerName,
            url: browser.page.url(),
            loggedIn,
          });

          const rl = readline.createInterface({ input, crlfDelay: Infinity });
          for await (const line of rl) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            let request: DelegateRequest;
            try {
              request = parseRequest(trimmed);
            } catch (error) {
              writeJsonLine({
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              });
              continue;
            }

            const action = request.action ?? 'status';
            try {
              switch (action) {
                case 'status': {
                  writeJsonLine({
                    ok: true,
                    id: request.id,
                    action,
                    provider: providerName,
                    url: browser.page.url(),
                    title: await browser.page.title(),
                    loggedIn: await provider.actions.isLoggedIn(browser.page),
                  });
                  break;
                }
                case 'goto': {
                  const url = requireString(request.url, 'url');
                  await browser.page.goto(url, { waitUntil: 'domcontentloaded' });
                  writeJsonLine({
                    ok: true,
                    id: request.id,
                    action,
                    provider: providerName,
                    url: browser.page.url(),
                  });
                  break;
                }
                case 'selectModel': {
                  const model = requireString(request.model, 'model');
                  if (!provider.actions.selectModel) {
                    throw new Error(
                      `${provider.config.displayName} does not support model selection`,
                    );
                  }
                  await provider.actions.selectModel(browser.page, model);
                  writeJsonLine({
                    ok: true,
                    id: request.id,
                    action,
                    provider: providerName,
                    result: { model },
                  });
                  break;
                }
                case 'attach': {
                  const files = requireStringArray(request.files, 'files');
                  if (!provider.actions.attachFiles) {
                    throw new Error(
                      `${provider.config.displayName} does not support file attachments`,
                    );
                  }
                  const resolved = await resolveAttachPaths(files);
                  await provider.actions.attachFiles(browser.page, resolved);
                  writeJsonLine({
                    ok: true,
                    id: request.id,
                    action,
                    provider: providerName,
                    result: { files: resolved },
                  });
                  break;
                }
                case 'submit': {
                  const prompt = requireString(request.prompt, 'prompt');
                  await provider.actions.submitPrompt(browser.page, prompt);
                  writeJsonLine({ ok: true, id: request.id, action, provider: providerName });
                  break;
                }
                case 'capture': {
                  const response = await capture(
                    providerName,
                    request.timeoutMs ?? timeoutMs,
                    browser.page,
                  );
                  writeJsonLine({
                    ok: true,
                    id: request.id,
                    action,
                    provider: providerName,
                    response,
                  });
                  break;
                }
                case 'chat': {
                  if (request.model) {
                    if (!provider.actions.selectModel) {
                      throw new Error(
                        `${provider.config.displayName} does not support model selection`,
                      );
                    }
                    await provider.actions.selectModel(browser.page, request.model);
                  }
                  if (request.files && request.files.length > 0) {
                    if (!provider.actions.attachFiles) {
                      throw new Error(
                        `${provider.config.displayName} does not support file attachments`,
                      );
                    }
                    const resolved = await resolveAttachPaths(request.files);
                    await provider.actions.attachFiles(browser.page, resolved);
                  }
                  const prompt = requireString(request.prompt, 'prompt');
                  await provider.actions.submitPrompt(browser.page, prompt);
                  const response = await capture(
                    providerName,
                    request.timeoutMs ?? timeoutMs,
                    browser.page,
                  );
                  writeJsonLine({
                    ok: true,
                    id: request.id,
                    action,
                    provider: providerName,
                    response,
                  });
                  break;
                }
                case 'eval': {
                  const script = requireString(request.script, 'script');
                  const result = await browser.page.evaluate(script);
                  writeJsonLine({
                    ok: true,
                    id: request.id,
                    action,
                    provider: providerName,
                    result,
                  });
                  break;
                }
                case 'close': {
                  writeJsonLine({ ok: true, id: request.id, action, provider: providerName });
                  rl.close();
                  await close();
                  return;
                }
                default:
                  throw new Error(`Unsupported delegate action: ${String(action)}`);
              }
            } catch (error) {
              writeJsonLine({
                ok: false,
                id: request.id,
                action,
                provider: providerName,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        } finally {
          await close();
        }
      },
    );

  return cmd;
}
