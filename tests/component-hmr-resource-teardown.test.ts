import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'path';
import { readFile, writeFile } from 'fs-extra';
import { startVite } from './utils';

// Reproduces https://github.com/patricklx/ember-vite-hmr/issues/557 end-to-end
// against the committed `test-app`.
//
// setup-hmr-manager.ts's `getState()` walks every enumerable property of a
// component instance to carry its state over to the next HMR-swapped
// instance. For a property whose value is a resource proxy (e.g.
// `ember-resources`' `resource()`, which reactiveweb's `trackedTask` wraps)
// that the template never dereferences, `getState`'s own
// `Object.prototype.toString.call(entry.value)` check is the FIRST read of
// that proxy - which lazily calls `invokeHelper`/`associateDestroyableChild`
// with the component instance as the parent. `getState` runs (via a
// deferred setTimeout) against the OLD component instance, which by then is
// already mid-teardown from the HMR swap - so this throws "Attempted to
// associate a destroyable child with an object that is already destroying
// or destroyed", even on the very first edit, with no navigation race
// needed.
//
// Uses its own port so it can run alongside the other test-app-backed suites.

describe('test-app: HMR-destroyed component with an unread resource-backed field', () => {
  let ctx: Awaited<ReturnType<typeof startVite>>;
  const componentPath = resolve(
    'test-app/app/components/resource-holder.gts',
  );
  let originalContent: string;

  beforeAll(async () => {
    originalContent = (await readFile(componentPath)).toString();
    ctx = await startVite({ cwd: resolve('test-app'), port: 60278 });
  }, 180_000);

  afterAll(async () => {
    await writeFile(componentPath, originalContent);
    await ctx?.stop();
  });

  test('editing the component does not throw on the destroyed instance', async () => {
    const errors: string[] = [];
    ctx.page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));

    await ctx.page.click('.nav-equipment');
    await ctx.page.waitForSelector('.equipment-page');
    await ctx.page.waitForSelector('.resource-holder');

    // Trivial in-place edit - just enough to trigger a HotComponent swap of
    // ResourceHolder without changing its structure.
    await writeFile(
      componentPath,
      originalContent.replace('resource holder', 'resource holder!'),
    );

    await ctx.page.waitForSelector('.resource-holder');
    await ctx.page.waitForFunction(
      () =>
        document.querySelector('.resource-holder')?.textContent ===
        'resource holder!',
      { timeout: 5_000 },
    );

    // The crash is reported asynchronously (from a deferred setTimeout), so
    // give it a moment to surface before asserting.
    await new Promise((r) => globalThis.setTimeout(r, 500));

    const isAssociateChildError = (e: string) =>
      /associate a destroyable child/i.test(e);
    expect(
      errors.find(isAssociateChildError),
      `unexpected destroyable-child error:\n${errors.join('\n')}`,
    ).toBeUndefined();
  }, 30_000);
});
