import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN_FILENAMES = /(^|\/)\.env($|\.(?!example$))/i;

const SECRET_PATTERNS = [
  { name: 'Private Key Header', regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'Razorpay Live Key', regex: /\brzp_live_[A-Za-z0-9]{10,}\b/ },
  { name: 'Resend API Key', regex: /\bre_[A-Za-z0-9_]{20,}\b/ },
  { name: 'AWS Access Key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub Token', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/ },
  {
    name: 'High-Confidence Secret Assignment',
    regex:
      /(?:AUTH_SECRET|GUEST_COOKIE_SECRET|RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET|UPSTASH_REDIS_REST_TOKEN|SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY)\s*[:=]\s*['"]?(?!replace_with_)[A-Za-z0-9+/=_-]{24,}['"]?/,
  },
];

function getStagedFiles() {
  const out = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'], {
    encoding: 'utf8',
  });
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const files = process.argv.includes('--all')
  ? execFileSync('git', ['ls-files'], { encoding: 'utf8' })
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
  : getStagedFiles();

const findings = [];

for (const relPath of files) {
  if (FORBIDDEN_FILENAMES.test(relPath)) {
    findings.push(`${relPath}: Forbidden .env file staged for commit`);
    continue;
  }

  if (relPath === 'scripts/secret-scan.mjs' || relPath.endsWith('.png') || relPath.endsWith('.jpg')) {
    continue;
  }

  const fullPath = path.resolve(process.cwd(), relPath);
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) continue;

  const content = fs.readFileSync(fullPath, 'utf8');
  for (const rule of SECRET_PATTERNS) {
    if (rule.regex.test(content)) {
      findings.push(`${relPath}: Matched ${rule.name}`);
    }
  }
}

if (findings.length > 0) {
  console.error('Secret scan failed! Remove sensitive data before committing:');
  for (const f of findings) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`Secret scan passed (${files.length} file(s) checked).`);
