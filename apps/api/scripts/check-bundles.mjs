// Smoke test of the Lambda zips written by build.mjs (#25).
//
// It checks what the Lambda runtime will need, without deploying anything:
//   - there is exactly one zip per file in src/handlers/;
//   - each zip has index.mjs at its root;
//   - index.mjs can be imported (all bundled code loads) and exports `handler`;
//   - the authorizer bundle does not include unpdf or the openai SDK, which
//     only analyze-pdf needs (smaller zip, faster cold start).
//
// Run it after the build: `npm run build -w @gaceta/api` does both.

import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { unzipSync } from 'fflate';

const API_DIR = path.join(import.meta.dirname, '..');
const DIST_DIR = path.join(API_DIR, 'dist');
const HANDLERS_DIR = path.join(API_DIR, 'src', 'handlers');

/** Packages that must not end up in the authorizer bundle. */
const NOT_ALLOWED_IN_AUTHORIZER = [
  'node_modules/unpdf/',
  'node_modules/openai/',
];

async function main() {
  const handlerNames = await listHandlerNames();
  await checkZipCount(handlerNames);

  for (const name of handlerNames) {
    await checkZip(name);
  }
  await checkAuthorizerDependencies();

  console.log(`All ${handlerNames.length} Lambda zips look good.`);
}

async function listHandlerNames() {
  const files = await readdir(HANDLERS_DIR);
  return files
    .filter((file) => file.endsWith('.ts'))
    .map((file) => file.replace(/\.ts$/, ''));
}

async function checkZipCount(handlerNames) {
  const files = await readdir(DIST_DIR);
  const zips = files.filter((file) => file.endsWith('.zip'));
  if (zips.length !== handlerNames.length) {
    fail(
      `Expected ${handlerNames.length} zips in dist/, found ${zips.length}: ${zips.join(', ')}`,
    );
  }
}

async function checkZip(name) {
  const zipBytes = await readFile(path.join(DIST_DIR, `${name}.zip`));
  const entries = unzipSync(zipBytes);

  const entry = entries['index.mjs'];
  if (entry === undefined) {
    fail(`${name}.zip has no index.mjs at its root`);
  }

  // Import the file from a folder outside the repository, like the Lambda
  // runtime does: if the bundle still needed something from node_modules,
  // the import would fail here.
  const folder = await mkdtemp(path.join(tmpdir(), `lambda-${name}-`));
  try {
    const entryPath = path.join(folder, 'index.mjs');
    await writeFile(entryPath, entry);
    const bundle = await import(pathToFileURL(entryPath).href);
    if (typeof bundle.handler !== 'function') {
      fail(`${name}.zip does not export a handler function`);
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }

  console.log(`  ${name}.zip: index.mjs exports handler`);
}

async function checkAuthorizerDependencies() {
  const metafileText = await readFile(
    path.join(DIST_DIR, 'authorizer.meta.json'),
    'utf8',
  );
  const bundledFiles = Object.keys(JSON.parse(metafileText).inputs);

  for (const packagePath of NOT_ALLOWED_IN_AUTHORIZER) {
    const found = bundledFiles.some((file) => file.includes(packagePath));
    if (found) {
      fail(`The authorizer bundle must not include ${packagePath}`);
    }
  }
  console.log('  authorizer.zip: no unpdf, no openai');
}

function fail(message) {
  console.error(`Bundle check failed: ${message}`);
  process.exit(1);
}

await main();
