// ESLint flat config for the whole monorepo (NFR-MAINT-05).
// Run it from the repository root with `npm run lint`.
import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/build/',
    '**/coverage/',
    'docs/',
  ]),

  // Base rules for every JavaScript and TypeScript file.
  eslint.configs.recommended,

  // TypeScript files: type-aware rules. `projectService` finds the nearest
  // tsconfig.json of each file, so every workspace is checked with its own settings.
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // CLAUDE.md: no `any` unless a comment explains why. When `any` is really
      // needed, disable this rule on that line with an explanation.
      '@typescript-eslint/no-explicit-any': 'error',
      // Unused variables are errors, but a leading underscore marks an
      // intentionally unused parameter (for example in a callback signature).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Type-only imports must say so, which matches `verbatimModuleSyntax` in tsconfig.
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },

  // Config and script files written in plain JavaScript (for example this file
  // and the esbuild script) run in Node.js.
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // React rules only apply to the web app.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: {
      globals: globals.browser,
    },
  },

  // Must be last: turns off every rule that would conflict with Prettier,
  // so ESLint checks code quality and Prettier owns formatting.
  eslintConfigPrettier,
);
