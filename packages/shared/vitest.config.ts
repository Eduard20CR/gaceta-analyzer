import { defineConfig } from 'vitest/config';

// Vitest settings for this workspace (NFR-MAINT-04).
export default defineConfig({
  test: {
    // Tests live next to src/, in tests/ (see docs/architecture.md).
    include: ['tests/**/*.test.ts'],
    // Tests import describe/it/expect from 'vitest' explicitly instead of using globals,
    // so it is always clear where each function comes from.
    globals: false,
  },
});
