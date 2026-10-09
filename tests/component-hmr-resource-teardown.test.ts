import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'path';
import { readFile, writeFile } from 'fs-extra';
import { startVite } from './utils';

// Reproduces https://github.com/patricklx/ember-vite-hmr/issues/557 and its
// follow-up https://github.com/patricklx/ember-vite-hmr/issues/563 end-to-end
// against the committed `test-app`.
//
// setup-hmr-manager.ts's `getState()` walks every enumerable property of a
// component instance to carry its state over to the next HMR-swapped
// instance. For a property whose value is a resource proxy (e.g.
// `ember-resources`' `resource()`, which reactiveweb's `trackedTask` wraps)
// that the template never dereferences:
//
// - #557: `getState`'s own `Object.prototype.toString.call(entry.value)`
//   check used to be the FIRST read of that proxy - which lazily calls
//   `invokeHelper`/`associateDestroyableChild` with the component instance
//   as the parent. `getState` runs (via a deferred setTimeout) against the
//   OLD component instance, which by then is already mid-teardown from the
//   HMR swap - so this threw "Attempted to associate a destroyable child
//   with an object that is already destroying or destroyed", even on the
//   very first edit, with no navigation race needed. Fixed by no longer
//   probing `entry.value` beyond the `typeof value === 'function'` check.
// - #563: even without that probe, `getState` still carried the proxy's
//   *reference* onto the new instance's field, overwriting the new
//   instance's own correctly-parented resource. The crash then surfaces on
//   the first read of that field FROM CODE after the swap (not the initial
//   render), since the proxy's cache is permanently bound to whichever
//   instance was passed as `context` when `resource()` was first called -
//   always the old, destroyed one for a carried-over reference. Fixed by
//   skipping resource()-backed values in `getState` entirely, detected via
//   `in` (the one reflective op the proxy doesn't trap), so the new
//   instance keeps its own resource untouched.
//
// Uses its own port so it can run alongside the other test-app-backed suites.

describe('test-app: HMR-destroyed component with an unread resource-backed field', () => {
  let ctx: Awaited<ReturnType<typeof startVite>>;
  const componentPath = resolve('test-app/app/components/resource-holder.gts');
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

  test('ordinary tracked state is still carried over across the swap', async () => {
    await ctx.page.click('.nav-equipment');
    await ctx.page.waitForSelector('.equipment-page');
    await ctx.page.waitForSelector('.resource-holder-increment');

    await ctx.page.click('.resource-holder-increment');
    await ctx.page.click('.resource-holder-increment');
    await ctx.page.waitForFunction(
      () =>
        document.querySelector('.resource-holder-count')?.textContent === '2',
    );

    // Same kind of in-place edit as above - just enough to trigger a
    // HotComponent swap without changing component structure. The fix for
    // #557 removes a redundant `Object.prototype.toString.call(entry.value)`
    // check from getState() (the one that touched the resource proxy) -
    // this asserts that removal doesn't regress the normal case of an
    // ordinary tracked field transferring across the swap.
    await writeFile(
      componentPath,
      originalContent.replace('resource holder', 'resource holder?'),
    );

    await ctx.page.waitForSelector('.resource-holder');
    await ctx.page.waitForFunction(
      () =>
        document.querySelector('.resource-holder')?.textContent ===
        'resource holder?',
      { timeout: 5_000 },
    );

    const count = await ctx.page.textContent('.resource-holder-count');
    expect(count).toBe('2');
  }, 30_000);

  // Reproduces https://github.com/patricklx/ember-vite-hmr/issues/563, the
  // narrower follow-up to #557 that the fix above doesn't cover: getState()
  // still carries the *reference* to an unread resource proxy over onto the
  // new, HMR-swapped instance's field (overwriting that instance's own,
  // correctly-parented resource). The proxy's underlying helper cache is
  // permanently bound, on first read, to whichever instance was passed as
  // `context` when `resource()` was originally called - for the carried-over
  // proxy that's always the *old*, already-destroyed instance. So the crash
  // doesn't surface on the initial render (which happens before syncState's
  // deferred setTimeout runs the overwrite); it surfaces on the first
  // *subsequent* read of that field from code - e.g. an action handler.
  test('reading the resource-backed field from an action after the swap does not throw', async () => {
    const errors: string[] = [];
    ctx.page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));

    await ctx.page.click('.nav-equipment');
    await ctx.page.waitForSelector('.equipment-page');
    await ctx.page.waitForSelector('.resource-holder-read');

    // In-place edit to trigger a HotComponent swap, same as the other tests.
    await writeFile(
      componentPath,
      originalContent.replace('resource holder', 'resource holder#'),
    );
    await ctx.page.waitForSelector('.resource-holder');
    await ctx.page.waitForFunction(
      () =>
        document.querySelector('.resource-holder')?.textContent ===
        'resource holder#',
      { timeout: 5_000 },
    );

    // Give syncState's deferred setTimeout a moment to carry old state over
    // onto the new instance before reading the field from an action.
    await new Promise((r) => globalThis.setTimeout(r, 500));

    await ctx.page.click('.resource-holder-read');
    await ctx.page.waitForFunction(
      () =>
        document.querySelector('.resource-holder-ran-value')?.textContent !==
        '',
    );

    const isAssociateChildError = (e: string) =>
      /associate a destroyable child/i.test(e);
    expect(
      errors.find(isAssociateChildError),
      `unexpected destroyable-child error:\n${errors.join('\n')}`,
    ).toBeUndefined();

    const ranValue = await ctx.page.textContent('.resource-holder-ran-value');
    expect(ranValue).toBe('true');
  }, 30_000);
});
