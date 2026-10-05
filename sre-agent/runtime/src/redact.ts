const SECRETS: Array<[RegExp, string]> = [
  [/\bBearer\s+[^\s"']+/gi, "Bearer [redacted]"],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, "[redacted]"],
  [/\b(?:sk|pk|rk|ghp|gho|ghs|github_pat|xox[abp])[-_][\w-]{6,}/g, "[redacted]"],
  [/\b(password|passwd|secret|token|api[-_]?key|apikey|authorization|cookie)(\s*[=:]\s*)[^\s,;&"']+/gi, "$1$2[redacted]"],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"],
  [/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "[ip]"],
];

/**
 * Make a log excerpt safe to put in an issue: strip secrets and personal data,
 * keep it inside our code fence, and stop it from pinging anyone.
 * Log text is attacker-controlled; this limits what it can do, it does not make it trustworthy.
 */
export function sanitizeForIssue(text: string, maxLength = 1500): string {
  let out = text;
  for (const [pattern, replacement] of SECRETS) out = out.replace(pattern, replacement);
  out = out.replace(/`{3,}/g, "ʼʼʼ").replace(/(^|[^\w])@(?=\w)/g, "$1@​");
  return out.length > maxLength ? `${out.slice(0, maxLength)}…[truncated]` : out;
}
