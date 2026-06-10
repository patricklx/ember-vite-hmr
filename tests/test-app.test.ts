import { describe, test, expect, beforeAll } from 'vitest';
import { resolve } from 'path';
import { startVite } from './utils';

// Reproduces the mandatory-setter bug end-to-end against the committed
// `test-app`, which is wired to the local library via the workspace
// (`ember-vite-hmr: workspace:*`).
//
// The bug only manifests in vite DEV mode (the HMR patch is installed when
// `import.meta.hot` is truthy), so this boots a real dev server (reusing the
// `startVite` harness) and drives a real browser. The first visit to /equipment
// is clean; the SECOND visit is where ember-vite-hmr's setupController patch
// re-applies the cached, non-`@tracked` `groupBy` onto the same controller and
// trips Ember's mandatory setter — unless the fix guards against re-applying
// state on the same instance.
//
// Run:
//   pnpm install && pnpm build
//   pnpm exec vitest run tests/test-app.test.ts
// Uses its own port so it can run alongside the playground suite.

describe('test-app: non-tracked query param survives re-navigation', () => {
  let page: Awaited<ReturnType<typeof startVite>>['page'];

  beforeAll(async () => {
    const ctx = await startVite({ cwd: resolve('test-app'), port: 60273 });
    page = ctx.page;
  }, 180_000);

  test('Equipment → Project → Equipment throws no mandatory-setter assertion', async () => {
    // The routing assertion is logged via console.error; an uncaught throw
    // surfaces as a pageerror. Collect both.
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    // startVite has already navigated to the app; wait for it to render.
    await page.waitForSelector('.nav-equipment');

    // 1st visit populates ember-vite-hmr's setupController state cache.
    await page.click('.nav-equipment');
    await page.waitForSelector('.equipment-page');

    await page.click('.nav-project');
    await page.waitForSelector('.project-page');

    // 2nd visit: with the fix the route re-renders cleanly; with the bug the
    // patch re-applies the cached `groupBy` and the mandatory setter throws.
    // The assertion is captured asynchronously, so poll for it (exiting early
    // when it appears) rather than sleeping a fixed amount — robust under slow
    // CI, where a fixed wait could be too short.
    await page.click('.nav-equipment');

    const isAssertion = (e: string) =>
      /attempted to update.*groupBy|mark the property as `?@tracked/i.test(e);
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline && !errors.some(isAssertion)) {
      await new Promise((r) => globalThis.setTimeout(r, 50));
    }

    const assertion = errors.find(isAssertion);
    expect(
      assertion,
      `mandatory-setter assertion fired on re-navigation:\n${errors.join('\n')}`,
    ).toBeUndefined();

    // Guard against a false pass: a silent no-op navigation would also produce
    // "no assertion". The 2nd visit must really have re-rendered the route.
    expect(await page.$('.equipment-page')).not.toBeNull();
  }, 60_000);

  // NOTE: the *other* branch of the fix — migrating state onto a NEW controller
  // instance produced by an in-place HMR swap — is intentionally not covered
  // here. Editing a module in this test-app triggers a full page reload (a known
  // limitation of the app/vite setup) rather than an in-place controller swap,
  // which wipes the module-level StateCache and resets state. A test for that
  // branch needs an environment where ember-vite-hmr hot-swaps controllers in
  // place. Tracked as a follow-up.
});
