import { isNative } from '@/native/platform';

/** Capacitor serves media through URLResponse, which can expose status 0 in WKWebView. */
export function isBundledMediaResponse(
  url: string,
  status: number,
  native = isNative,
  base = location.href,
) {
  if (!native || status !== 0) return false;
  const target = new URL(url, base);
  const origin = new URL(base);
  return (
    origin.protocol === 'capacitor:' &&
    target.protocol === origin.protocol &&
    target.host === origin.host &&
    target.pathname.startsWith('/audio/') &&
    /\.(mp3|m4a|wav)$/.test(target.pathname)
  );
}
export async function fetchAudioBytes(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok && !isBundledMediaResponse(url, response.status))
    throw new Error('Audio recording unavailable (' + response.status + ').');
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new Error('Audio recording is empty.');
  return bytes;
}
