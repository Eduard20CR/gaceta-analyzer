// Bundles each Lambda handler into its own zip (ADR-0002).
//
// For every handler in src/handlers/ this script:
//   1. runs esbuild, which follows the imports of that handler only, so each
//      bundle contains just the code it uses (the authorizer does not carry
//      unpdf or the openai SDK);
//   2. writes dist/<handler>/index.mjs (plus a source map);
//   3. zips that folder into dist/<handler>.zip, which Terraform uploads (#30).
//
// It also writes dist/<handler>.meta.json (esbuild's list of bundled files),
// which scripts/check-bundles.mjs uses to verify what each zip contains.
//
// Run it with `npm run build -w @gaceta/api` (or `npm run build:api` from the root).

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import * as esbuild from 'esbuild';
import { zipSync } from 'fflate';

const API_DIR = import.meta.dirname;
const DIST_DIR = path.join(API_DIR, 'dist');

/** The five Lambdas. Each name matches a file in src/handlers/ and a zip in dist/. */
const HANDLER_NAMES = [
  'authorizer',
  'create-job',
  'analyze-pdf',
  'get-job',
  'list-jobs',
];

/**
 * ESM bundles have no `require`, but some bundled CommonJS dependencies call
 * `require('node:...')` for Node.js built-in modules. This banner creates a real
 * `require` at the top of the bundle so those calls keep working.
 */
const REQUIRE_SHIM = [
  "import { createRequire as __createRequire } from 'node:module';",
  'const require = __createRequire(import.meta.url);',
].join('\n');

async function main() {
  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(DIST_DIR, { recursive: true });

  for (const name of HANDLER_NAMES) {
    await buildHandler(name);
  }

  console.log(`Built ${HANDLER_NAMES.length} Lambda zips in ${DIST_DIR}`);
}

async function buildHandler(name) {
  const outDir = path.join(DIST_DIR, name);

  const result = await esbuild.build({
    entryPoints: [path.join(API_DIR, 'src', 'handlers', `${name}.ts`)],
    outfile: path.join(outDir, 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: 'node24',
    // ESM because the whole repository uses ES modules ("type": "module") and
    // unpdf ships only as ESM. The `.mjs` extension tells the Lambda runtime
    // to load it as ESM, so the handler setting is `index.handler`.
    format: 'esm',
    banner: { js: REQUIRE_SHIM },
    // Not minified so stack traces in CloudWatch show readable names.
    minify: false,
    // External source map, used by the runtime thanks to NODE_OPTIONS=--enable-source-maps
    // (set in Terraform, #30), so errors point at the original .ts lines.
    sourcemap: true,
    // The AWS SDK v3 is bundled on purpose instead of using the copy inside the
    // Lambda runtime: the version in package-lock.json is the version that runs,
    // and tests and production use the same code.
    external: [],
    metafile: true,
    logLevel: 'warning',
  });

  await writeFile(
    path.join(DIST_DIR, `${name}.meta.json`),
    JSON.stringify(result.metafile, null, 2),
  );
  await zipFolder(outDir, path.join(DIST_DIR, `${name}.zip`));

  console.log(`  ${name}.zip`);
}

/** Zips the bundle files at the root of the archive, where Lambda looks for them. */
async function zipFolder(folder, zipPath) {
  const files = {};
  for (const fileName of ['index.mjs', 'index.mjs.map']) {
    files[fileName] = await readFile(path.join(folder, fileName));
  }

  // A fixed date makes the zip depend only on the code, so the hash Terraform
  // compares (source_code_hash) only changes when the code changes.
  const zipBytes = zipSync(files, { mtime: new Date('2000-01-01T00:00:00Z') });
  await writeFile(zipPath, zipBytes);
}

await main();
