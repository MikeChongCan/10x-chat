import type { Page } from 'playwright';

async function readCurrentUrl(page: Page): Promise<string> {
  try {
    const currentUrl = await page.evaluate(() => window.location.href);
    if (typeof currentUrl === 'string' && currentUrl.length > 0) {
      return currentUrl;
    }
  } catch {
    // Fall back to the page's cached/runtime URL below.
  }

  return page.url();
}

export async function waitForUrlChange(
  page: Page,
  initialUrl: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await readCurrentUrl(page)) !== initialUrl) return;
    await page.waitForTimeout(250);
  }

  throw new Error(`Timed out waiting for URL to change from ${initialUrl}`);
}

export async function waitForUrlPathPrefix(
  page: Page,
  prefix: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const currentUrl = new URL(await readCurrentUrl(page));
      if (currentUrl.pathname.startsWith(prefix)) return;
    } catch {
      // Keep polling until we either get a parseable URL or time out.
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Timed out waiting for URL path to start with ${prefix}`);
}
