import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import type { Page } from 'playwright';
import type { GeneratedVideo } from '../types.js';

/**
 * Download a specific set of video source URLs into `outputDir`.
 *
 * Handles both `blob:` URLs (read via in-page XHR → data URL) and HTTPS URLs
 * (fetched server-side with the context's cookies, with an in-page fetch
 * fallback). Callers scope `srcs` to the exact generation result so we never
 * grab unrelated `<video>`s (trending feed, other generations) on the page.
 */
export async function downloadVideoSrcs(
  page: Page,
  srcs: string[],
  outputDir: string,
): Promise<GeneratedVideo[]> {
  await mkdir(outputDir, { recursive: true });
  const results: GeneratedVideo[] = [];
  for (let i = 0; i < srcs.length; i++) {
    try {
      const { buf, contentType } = await fetchVideoBytes(page, srcs[i]);
      if (!buf) {
        console.warn(
          chalk.yellow(`  ⚠ Failed to download video ${i + 1} (src: ${srcs[i].slice(0, 80)})`),
        );
        results.push({});
        continue;
      }
      const ext = contentType.includes('webm') ? 'webm' : 'mp4';
      const filePath = path.join(outputDir, `video_${i + 1}.${ext}`);
      await writeFile(filePath, buf);
      console.log(chalk.green(`  ✓ Saved: ${filePath}`));
      results.push({ localPath: filePath });
    } catch (err) {
      console.warn(chalk.yellow(`  ⚠ Error downloading video ${i + 1}: ${err}`));
      results.push({});
    }
  }
  return results;
}

async function fetchVideoBytes(
  page: Page,
  src: string,
): Promise<{ buf: Buffer | null; contentType: string }> {
  if (src.startsWith('blob:')) {
    const dataUrl = await page.evaluate(async (videoUrl: string) => {
      return new Promise<string | null>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', videoUrl, true);
        xhr.responseType = 'blob';
        xhr.onload = () => {
          if (xhr.status === 200) {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(xhr.response);
          } else {
            resolve(null);
          }
        };
        xhr.onerror = () => resolve(null);
        xhr.send();
      });
    }, src);
    return decodeDataUrl(dataUrl);
  }

  // HTTPS: fetch server-side with the context's cookies first.
  const cookies = await page
    .context()
    .cookies([src])
    .catch(() => []);
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const resp = await fetch(src, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    redirect: 'follow',
  }).catch(() => null);
  if (resp?.ok) {
    return {
      buf: Buffer.from(await resp.arrayBuffer()),
      contentType: resp.headers.get('content-type') ?? '',
    };
  }

  // Fallback: in-browser fetch with credentials.
  const dataUrl = await page.evaluate(async (videoUrl: string) => {
    try {
      const r = await fetch(videoUrl, { credentials: 'include', redirect: 'follow' });
      if (!r.ok) return null;
      const blob = await r.blob();
      return new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }, src);
  return decodeDataUrl(dataUrl);
}

function decodeDataUrl(dataUrl: string | null): { buf: Buffer | null; contentType: string } {
  if (!dataUrl) return { buf: null, contentType: '' };
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return { buf: null, contentType: '' };
  return { buf: Buffer.from(match[2], 'base64'), contentType: match[1] };
}
