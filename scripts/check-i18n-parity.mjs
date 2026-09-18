#!/usr/bin/env node
// ============================================================================
// EN/RU dictionary parity gate.
//
// AGENTS.md requires that `translations.ENG` and `translations.RU` always carry
// identical key sets. This script is the mechanical check for that rule:
//
//   • equal key counts, no key present on only one side
//   • identical `{placeholder}` sets per key (a missing placeholder silently
//     prints a literal `{name}` to the user)
//   • no Cyrillic characters left in the English dictionary
//
// Usage: npm run check:i18n   (exit code 1 on any violation)
// ============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Extract `"key": "value"` pairs from a dictionary module. */
function parseDictionary(file) {
  const src = readFileSync(join(root, file), 'utf8');
  const entries = new Map();
  const re = /^\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$/gm;
  for (const m of src.matchAll(re)) entries.set(m[1], m[2]);
  return entries;
}

const placeholders = (value) => new Set([...value.matchAll(/\{(\w+)\}/g)].map(m => m[1]));

const en = parseDictionary('src/i18n/en.ts');
const ru = parseDictionary('src/i18n/ru.ts');

const problems = [];

const onlyEn = [...en.keys()].filter(k => !ru.has(k));
const onlyRu = [...ru.keys()].filter(k => !en.has(k));
if (onlyEn.length) problems.push(`keys only in EN: ${onlyEn.join(', ')}`);
if (onlyRu.length) problems.push(`keys only in RU: ${onlyRu.join(', ')}`);

for (const [key, value] of en) {
  const other = ru.get(key);
  if (other === undefined) continue;
  const a = placeholders(value);
  const b = placeholders(other);
  const missing = [...a].filter(p => !b.has(p));
  const extra = [...b].filter(p => !a.has(p));
  if (missing.length || extra.length) {
    problems.push(`placeholder mismatch for "${key}" (missing in RU: ${missing.join(',') || '—'}; extra in RU: ${extra.join(',') || '—'})`);
  }
}

const cyrillic = [...en.keys()].filter(k => /[\u0400-\u04FF]/.test(en.get(k) || ''));
if (cyrillic.length) problems.push(`Cyrillic text in the EN dictionary: ${cyrillic.join(', ')}`);

console.log(`EN keys: ${en.size} · RU keys: ${ru.size}`);

if (problems.length) {
  console.error('\n✖ i18n parity check failed:');
  problems.forEach(p => console.error(`  • ${p}`));
  process.exit(1);
}

console.log('✔ i18n parity OK (key sets, placeholders, no Cyrillic in EN)');
