import { defineConfig } from 'vitest/config';

// Every e2e test file below boots its own vite dev server against the same
// shared `test-app/` source tree and edits files in it (multi-counter.gts,
// block-base.gts, services/date/base.ts, ...). Each of those servers watches
// the whole tree, so when they ran in parallel one file's edits were
// hot-updated into every other file's open page too -- e.g. the
// inherited-template test's block-base.gts edit full-reloaded the
// multi-instance test's page mid-navigation. Running these files one at a
// time keeps each test's page seeing only its own edits (and stops the
// servers' `--force` runs from rebuilding test-app's shared dep-optimizer
// cache under each other).
//
// Any new test that calls `startVite({ cwd: resolve('test-app') })` belongs
// in this list.
const testAppE2eFiles = [
  'tests/component-hmr-*.test.ts',
  'tests/service-hmr-app.test.ts',
  'tests/test-app.test.ts',
];

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'test-app-e2e',
          include: testAppE2eFiles,
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/**/*.test.{ts,js}'],
          exclude: [...testAppE2eFiles, '**/node_modules/**'],
        },
      },
    ],
  },
});
