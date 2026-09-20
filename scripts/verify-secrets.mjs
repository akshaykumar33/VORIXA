#!/usr/bin/env node
/**
 * VORIXA codebase protection scanner.
 *
 * Inspects staged content (or the whole tree with --all) for credentials, env files,
 * oversized assets, conflict markers, and debug leftovers. Exits non-zero on any finding,
 * which is what makes the pre-commit hook block the commit.
 *
 * Zero dependencies by design: this must work on a fresh clone before `pnpm install`.
 *
 *   node scripts/verify-secrets.mjs          scan staged changes
 *   node scripts/verify-secrets.mjs --all    scan every tracked file
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const SCAN_ALL = process.argv.includes('--all');
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const c = process.stdout.isTTY
  ? { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m' }
  : { red: '', yellow: '', green: '', dim: '', bold: '', off: '' };

/**
 * Credential patterns. Each needs a `name` and `re`.
 * Keep these specific — a noisy scanner trains people to use --no-verify.
 */
const SECRET_PATTERNS = [
  { name: 'AWS access key ID', re: /\b(?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/ },
  { name: 'AWS secret access key', re: /\baws_secret_access_key\s*[=:]\s*['"]?[A-Za-z0-9/+=]{40}\b/i },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'GitHub fine-grained PAT', re: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { name: 'GitLab token', re: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Slack webhook', re: /https:\/\/hooks\.slack\.com\/services\/T[A-Za-z0-9_-]+\/B[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+/ },
  { name: 'Stripe secret key', re: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{20,}\b/ },
  { name: 'OpenAI API key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { name: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_-]{32,}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Google OAuth client secret', re: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'NPM token', re: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { name: 'SendGrid API key', re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/ },
  { name: 'Twilio account SID', re: /\bAC[a-f0-9]{32}\b/ },
  { name: 'Private key block', re: /-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH|PGP|ENCRYPTED)?\s*PRIVATE KEY(?:\s+BLOCK)?-----/ },
  { name: 'JSON Web Token', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: 'Bearer token literal', re: /\bBearer\s+[A-Za-z0-9_\-.=]{30,}/ },
  { name: 'DB connection string with credentials', re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:/@]+:[^\s:/@]+@/ },
  { name: 'Hardcoded credential assignment', re: /\b(?:api[_-]?key|apikey|secret[_-]?key|auth[_-]?token|access[_-]?token|client[_-]?secret|private[_-]?key|passwd|password)\s*[:=]\s*['"][^'"\s${}]{12,}['"]/i },
];

/** Paths that must never be committed. */
const FORBIDDEN_PATHS = [
  { name: 'Environment file', re: /(?:^|\/)\.env(?:\.[A-Za-z0-9_-]+)*$/ },
  { name: 'Private key file', re: /\.(?:pem|key|p12|pfx|keystore|jks|asc|ppk)$/i },
  { name: 'Certificate file', re: /\.(?:crt|cer|der)$/i },
  { name: 'SSH private key', re: /(?:^|\/)id_(?:rsa|dsa|ecdsa|ed25519)$/ },
  { name: 'Cloud credentials file', re: /(?:^|\/)(?:credentials|service-account.*\.json|gcloud-key.*\.json)$/i },
  { name: 'Shell history', re: /(?:^|\/)\.(?:bash|zsh)_history$/ },
];

/** Paths exempt from scanning — the scanner and its docs describe these patterns by necessity. */
const ALLOWLIST = [
  /(?:^|\/)\.env\.example$/,
  /(?:^|\/)scripts\/verify-secrets\.mjs$/,
  /(?:^|\/)docs\/operations\/GIT_WORKFLOW\.md$/,
  /(?:^|\/)docs\/architecture\/SECURITY\.md$/,
  /(?:^|\/)SECURITY\.md$/,
  /(?:^|\/)\.githooks\//,
  /(?:^|\/)pnpm-lock\.yaml$/,
  /(?:^|\/)package-lock\.json$/,
];

/** Extensions treated as binary and skipped for content scanning. */
const BINARY_EXT = /\.(?:png|jpe?g|gif|webp|avif|ico|svgz|mp[34]|ogg|wav|flac|woff2?|ttf|otf|eot|glb|gltf|ktx2|basis|bin|wasm|zip|gz|tar|7z|pdf|mov|mp4|webm)$/i;

const CONTENT_RULES = [
  { name: 'Merge conflict marker', re: /^(?:<{7}|={7}|>{7})(?:\s|$)/m, appliesTo: () => true },
  { name: 'Leftover debugger statement', re: /(?:^|[\s;{])debugger\s*(?:;|$)/m, appliesTo: (p) => /\.(?:ts|tsx|js|mjs|cjs|jsx)$/.test(p) },
];

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function targetFiles() {
  const out = SCAN_ALL
    ? git(['ls-files'])
    : git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']);
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

/** Staged content, so a partially-staged file is judged on what is actually being committed. */
function contentOf(file) {
  if (SCAN_ALL) return readFileSync(file, 'utf8');
  return git(['show', `:${file}`]);
}

function sizeOf(file) {
  if (SCAN_ALL) return statSync(file).size;
  const out = git(['cat-file', '-s', `:${file}`]).trim();
  return Number.parseInt(out, 10);
}

function isAllowlisted(file) {
  return ALLOWLIST.some((re) => re.test(file));
}

const findings = [];
function report(file, line, rule, detail) {
  findings.push({ file, line, rule, detail });
}

function scan(file) {
  // Allowlist wins over every rule below, including the path rules — .env.example is a
  // forbidden-looking path that is required to exist.
  if (isAllowlisted(file)) return;

  for (const { name, re } of FORBIDDEN_PATHS) {
    if (re.test(file)) {
      report(file, null, name, 'this file must never be committed');
      return; // path is already disqualifying; no need to read it
    }
  }

  let bytes;
  try {
    bytes = sizeOf(file);
  } catch {
    return; // deleted or unreadable — nothing to judge
  }
  if (bytes > MAX_FILE_BYTES) {
    report(file, null, 'Oversized file', `${(bytes / 1024 / 1024).toFixed(2)} MB exceeds the 2 MB limit`);
  }

  if (BINARY_EXT.test(file)) return;

  let text;
  try {
    text = contentOf(file);
  } catch {
    return;
  }
  if (text.includes('\u0000')) return; // binary without a known extension

  const lines = text.split('\n');

  for (const { name, re } of SECRET_PATTERNS) {
    for (let i = 0; i < lines.length; i += 1) {
      const m = re.exec(lines[i]);
      if (!m) continue;
      const shown = m[0].length > 24 ? `${m[0].slice(0, 12)}…${m[0].slice(-4)}` : m[0];
      report(file, i + 1, name, shown);
      break; // one finding per pattern per file is enough to block
    }
  }

  for (const { name, re, appliesTo } of CONTENT_RULES) {
    if (!appliesTo(file)) continue;
    for (let i = 0; i < lines.length; i += 1) {
      if (!re.test(lines[i])) continue;
      report(file, i + 1, name, lines[i].trim().slice(0, 60));
      break;
    }
  }
}

function main() {
  let files;
  try {
    files = targetFiles();
  } catch (err) {
    console.error(`${c.red}verify-secrets: not a git repository or git is unavailable.${c.off}`);
    console.error(String(err.message ?? err));
    process.exit(2);
  }

  if (files.length === 0) {
    console.log(`${c.dim}verify-secrets: nothing ${SCAN_ALL ? 'tracked' : 'staged'} to scan.${c.off}`);
    process.exit(0);
  }

  for (const file of files) scan(file);

  const scope = SCAN_ALL ? 'tracked files' : 'staged files';
  if (findings.length === 0) {
    console.log(`${c.green}✓${c.off} verify-secrets: ${files.length} ${scope} clean.`);
    process.exit(0);
  }

  console.error('');
  console.error(`${c.red}${c.bold}✗ COMMIT BLOCKED — sensitive content detected${c.off}`);
  console.error(`${c.dim}${'─'.repeat(64)}${c.off}`);
  for (const f of findings) {
    const loc = f.line ? `${f.file}:${f.line}` : f.file;
    console.error(`  ${c.red}${f.rule}${c.off}`);
    console.error(`    ${loc}`);
    console.error(`    ${c.dim}${f.detail}${c.off}`);
  }
  console.error(`${c.dim}${'─'.repeat(64)}${c.off}`);
  console.error(`${c.yellow}${findings.length} finding(s) across ${files.length} ${scope}.${c.off}`);
  console.error('');
  console.error('What to do:');
  console.error('  1. Remove the credential from the file.');
  console.error(`  2. ${c.bold}Rotate it${c.off} — assume it is compromised the moment it hit disk.`);
  console.error('  3. Reference it via .env.local instead, and document the key in .env.example.');
  console.error('');
  console.error(`${c.dim}False positive? Confirm by eye, then commit with --no-verify, disclose it in`);
  console.error(`the PR, and narrow the pattern in scripts/verify-secrets.mjs in the same PR.`);
  console.error(`See docs/operations/GIT_WORKFLOW.md §2.4.${c.off}`);
  console.error('');
  process.exit(1);
}

main();
