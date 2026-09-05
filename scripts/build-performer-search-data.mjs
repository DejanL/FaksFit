#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createPerformerSearchRegistry } from './performer-search-data.mjs';

const INPUT_PATH = resolve(process.argv[2] ?? 'data/programme-teachers.json');
const OUTPUT_PATH = resolve(
  process.argv[3] ?? 'data/programme-performer-search.json',
);

const teachersRegistry = JSON.parse(await readFile(INPUT_PATH, 'utf8'));
const searchRegistry = createPerformerSearchRegistry(teachersRegistry);

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(searchRegistry)}\n`, 'utf8');

console.log(
  `Wrote performer search data for ${searchRegistry.metadata.programmes_with_data} study programmes to ${OUTPUT_PATH}`,
);
