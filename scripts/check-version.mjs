#!/usr/bin/env node
/**
 * Guard against release-metadata drift: package.json, tauri.conf.json and
 * Cargo.toml all carry the app version independently, and a mismatch ships a
 * DMG whose updater manifest disagrees with the binary inside it.
 *
 * Run with no argument to check the three files agree; pass a tag (`v0.6.4`)
 * to also require that they match the tag being released.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const versions = {
  'package.json': JSON.parse(read('package.json')).version,
  'src-tauri/tauri.conf.json': JSON.parse(read('src-tauri/tauri.conf.json'))
    .version,
  'src-tauri/Cargo.toml': read('src-tauri/Cargo.toml').match(
    /^version = "([^"]+)"/m,
  )?.[1],
};

const tag = process.argv[2]?.replace(/^v/, '');
const expected = tag ?? versions['package.json'];
const wrong = Object.entries(versions).filter(
  ([, value]) => value !== expected,
);

for (const [file, value] of Object.entries(versions)) {
  console.log(`${value ?? '(unreadable)'}\t${file}`);
}

if (wrong.length > 0) {
  console.error(
    `\nVersion mismatch: expected ${expected}, but ` +
      wrong.map(([file, value]) => `${file} is ${value}`).join(', '),
  );
  process.exit(1);
}

console.log(`\nAll release metadata reports ${expected}.`);
