/** Checks a pasted Canvas Calendar Feed link. Shared by the browser (instant feedback) and the server (enforced). */
export function validateFeedUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "That doesn't look like a link. Copy the whole Calendar Feed link from Canvas." };
  }
  if (url.protocol !== "https:") return { ok: false, error: "The link must start with https://" };
  if (url.username || url.password) return { ok: false, error: "That link isn't a Canvas Calendar Feed link." };
  if (url.port && url.port !== "443") return { ok: false, error: "That link isn't a Canvas Calendar Feed link." };
  if (url.search || url.hash) return { ok: false, error: "That link has extra parts on the end. Copy the Calendar Feed link exactly as Canvas shows it." };
  // Schools use *.instructure.com and their own domains (canvas.school.edu), so only the path is checked.
  if (!/^\/feeds\/calendars\/user_[A-Za-z0-9]+\.ics$/.test(url.pathname)) {
    return { ok: false, error: "That isn't a Canvas Calendar Feed link. In Canvas, open Calendar → Calendar Feed and copy the link that ends in .ics." };
  }
  return { ok: true, url };
}

/** "canvas.school.edu/…/user_ab12…ics" – enough to recognise it, never the secret part. */
export function maskFeedUrl(raw: string) {
  try {
    const url = new URL(raw);
    const token = url.pathname.match(/user_([A-Za-z0-9]+)\.ics$/)?.[1] ?? "";
    return `${url.host}/feeds/calendars/user_${token.slice(0, 4)}••••.ics`;
  } catch {
    return "Canvas calendar feed";
  }
}
