// Adapted from juneaus-number-quest/sync/src/email.ts.

const b64 = (s: string): string => {
  let bin = "";
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin);
};
const wrap = (s: string): string => s.replace(/.{1,76}/g, "$&\r\n").trimEnd();
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A multipart/alternative email (plain text + HTML), UTF-8 throughout, for the send_email binding. */
export function mime(m: { from: string; to: string; subject: string; text: string; html: string; id: string; date: Date }): string {
  const boundary = `sre-${m.id}`;
  return [
    `From: ${m.from}`,
    `To: ${m.to}`,
    `Subject: =?UTF-8?B?${b64(m.subject)}?=`,
    `Message-ID: <${m.id}@mumm.dev>`,
    `Date: ${m.date.toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap(b64(m.text)),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap(b64(m.html)),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/** Escaped plain text as HTML, with URLs linked. */
export function toHtml(text: string): string {
  const body = esc(text)
    .split("\n")
    .map((line) => line.replace(/https:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`))
    .join("<br>\n");
  return `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5">${body}</div>`;
}
