// Analyzes a PDF on your computer with the same pipeline as the analyze-pdf
// Lambda, to try prompts and block sizes cheaply (issue #15).
//
//   DEEPSEEK_API_KEY=… npm run analyze:local -w @gaceta/api -- gaceta.pdf --query "impuestos, aranceles"
//
// All the logic lives in local-cli.ts; this file only connects it to the real
// file system, console and DeepSeek.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { createAiClient } from '../src/lib/ai-client';

import { runCli } from './local-cli';

// `npm run -w @gaceta/api` runs this script inside apps/api, but a path like
// `gaceta.pdf` should mean the folder where you typed the command. npm keeps that
// folder in INIT_CWD.
const baseDirectory = process.env['INIT_CWD'] ?? process.cwd();

const exitCode = await runCli(process.argv.slice(2), process.env, {
  readFile: async (path) =>
    new Uint8Array(await readFile(resolve(baseDirectory, path))),
  writeFile: (path, content) =>
    writeFile(resolve(baseDirectory, path), content, 'utf8'),
  createAiClient: (options) => createAiClient(options),
  print: (line) => console.log(line),
  printProgress: (line) => console.error(line),
});

process.exitCode = exitCode;
