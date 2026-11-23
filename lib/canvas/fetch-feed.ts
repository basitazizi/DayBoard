// Server only: imported by route handlers (it uses Node's DNS to block private addresses).
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { validateFeedUrl } from "./feed-url";

/**
 * Downloads a Canvas calendar feed safely (server only).
 * - https only, and only to public internet addresses (no localhost / private networks / cloud metadata)
 * - 10 second timeout, 5 MB limit, at most 2 redirects (each one re-checked)
 * - the feed link is a secret: it is never logged or put in error messages
 */

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 2;

export type FeedResult =
  | { status: "ok"; text: string; etag?: string; lastModified?: string }
  | { status: "not_modified" }
  | { status: "broken"; error: string }
  | { status: "error"; error: string };

function ipv4ToNumber(ip: string) {
  return ip.split(".").reduce((total, part) => total * 256 + Number(part), 0);
}

function inRange(ip: string, base: string, bits: number) {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((ipv4ToNumber(ip) & mask) >>> 0) === ((ipv4ToNumber(base) & mask) >>> 0);
}

/** True for addresses that must never be fetched: loopback, private, link-local, carrier NAT, multicast, reserved. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(ip) === 4) {
    return [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["224.0.0.0", 3]
    ].some(([base, bits]) => inRange(ip, base as string, bits as number));
  }
  if (isIP(ip) === 6) {
    if (ip === "::" || ip === "::1") return true;
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(ip) || ip.startsWith("64:ff9b:") || ip.startsWith("2001:db8:");
  }
  return true;
}

async function assertPublicHost(hostname: string) {
  if (isIP(hostname.replace(/^\[|\]$/g, ""))) {
    if (isPrivateAddress(hostname)) throw new Error("blocked");
    return;
  }
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(hostname)) throw new Error("blocked");
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) throw new Error("blocked");
}

async function readLimited(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new Error("too_large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error("too_large");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(all);
}

export async function fetchCanvasFeed(feedUrl: string, cache: { etag?: string | null; lastModified?: string | null } = {}): Promise<FeedResult> {
  const checked = validateFeedUrl(feedUrl);
  if (!checked.ok) return { status: "broken", error: checked.error };

  let url = checked.url;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (url.protocol !== "https:") return { status: "error", error: "Canvas redirected to an insecure address." };
      await assertPublicHost(url.hostname);

      const headers: Record<string, string> = { Accept: "text/calendar, text/plain;q=0.9", "User-Agent": "DayBoard-CalendarSync/1.0" };
      if (hop === 0 && cache.etag) headers["If-None-Match"] = cache.etag;
      if (hop === 0 && cache.lastModified) headers["If-Modified-Since"] = cache.lastModified;

      const response = await fetch(url, { headers, redirect: "manual", signal, cache: "no-store" });

      if (response.status >= 300 && response.status < 400 && response.status !== 304) {
        const location = response.headers.get("location");
        if (!location) return { status: "error", error: "Canvas sent an incomplete answer. We'll try again later." };
        url = new URL(location, url);
        continue;
      }
      if (response.status === 304) return { status: "not_modified" };
      if (response.status === 401 || response.status === 403 || response.status === 404 || response.status === 410) {
        return { status: "broken", error: "This Canvas link doesn't work any more. Copy a fresh Calendar Feed link from Canvas and paste it again." };
      }
      if (!response.ok) return { status: "error", error: "Couldn't reach Canvas — will retry." };

      const text = await readLimited(response);
      if (!/BEGIN:VCALENDAR/i.test(text.slice(0, 2000))) return { status: "broken", error: "That link didn't return a Canvas calendar. Copy the Calendar Feed link again." };
      return { status: "ok", text, etag: response.headers.get("etag") ?? undefined, lastModified: response.headers.get("last-modified") ?? undefined };
    }
    return { status: "error", error: "Canvas redirected too many times." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "blocked") return { status: "broken", error: "That address can't be used for a Canvas feed." };
    if (message === "too_large") return { status: "error", error: "The Canvas calendar is too large to import." };
    return { status: "error", error: "Couldn't reach Canvas — will retry." };
  }
}
