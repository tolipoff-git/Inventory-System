#!/usr/bin/env node
// Static documentation path contract; no build, network or runtime dependency.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const moved = [
  'docs/audits/AUDIT_REPORT.md',
  'docs/audits/AUDIT_LABEL_PRINT_REPORT.md',
  'docs/audits/AUDIT_INHERITED_V129.md',
  'docs/architecture/ENTERPRISE_ARCHITECTURE_PLAN.md',
];
const old = moved.map(path => path.split('/').at(-1));
for (const path of moved) {
  if (!existsSync(resolve(root, path))) throw Error('Missing canonical document: ' + path);
}
for (const path of old) {
  if (existsSync(resolve(root, path))) throw Error('Duplicate root audit/plan: ' + path);
}
for (const path of ['README.md', 'project_handoff.md', 'docs/README.md', ...moved]) {
  const full = resolve(root, path);
  const markdown = readFileSync(full, 'utf8');
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0].trim();
    if (!target || /^(?:https?:|mailto:|data:|\/\/)/.test(target)) continue;
    if (target.startsWith('/')) continue; // site-absolute URL
    if (!existsSync(resolve(dirname(full), decodeURIComponent(target)))) {
      throw Error(path + ': broken relative Markdown link: ' + target);
    }
  }
}
console.log('PASS: docs are canonical and local Markdown links resolve');
