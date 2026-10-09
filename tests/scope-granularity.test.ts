import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'path';
import { startVite } from './utils/index';

// Tests whether updating a tracked cell (entry.current = V2) only
// re-renders the inner {{#let (getCurrent) as |Comp|}} scope, or
// also the outer {{#let (getId) as |id|}} scope.
//
// If the outer scope does NOT re-render, `id` stays the same → a
// {{#let (hmr-id) as |id|}} wrapper around a component invocation
// would produce a stable per-call-site id across tracked-cell HMR swaps.
//
// If the outer scope re-renders, `id` increments → the approach fails.

describe('test-app: tracked cell update scope granularity', () => {
  let ctx: Awaited<ReturnType<typeof startVite>>;

  beforeAll(async () => {
    ctx = await startVite({ cwd: resolve('test-app'), port: 60291 });
  }, 180_000);

  afterAll(async () => {
    await ctx?.stop();
  });

  test('updating entry.current only re-renders inner {{#let}} scope', async () => {
    const errors: string[] = [];
    ctx.page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));

    await ctx.page.click('.nav-scope-test');
    await ctx.page.waitForSelector('.scope-test');

    // Initial state
    const idBefore = await ctx.page.locator('.outer-id').textContent();
    const labelBefore = await ctx.page.locator('.inner-label').textContent();
    expect(labelBefore).toBe('v1');
    console.log('outer id before swap:', idBefore);

    // Swap V1 → V2 via the tracked cell update
    await ctx.page.click('.swap-btn');
    await ctx.page.waitForFunction(
      () => document.querySelector('.inner-label')?.textContent === 'v2',
    );

    const idAfter = await ctx.page.locator('.outer-id').textContent();
    const labelAfter = await ctx.page.locator('.inner-label').textContent();
    console.log('outer id after swap:', idAfter);

    expect(errors.join('\n')).toBe('');
    expect(labelAfter).toBe('v2');

    // The key assertion:
    if (idAfter === idBefore) {
      console.log('✓ STABLE — outer scope did NOT re-render, id unchanged');
    } else {
      console.log('✗ UNSTABLE — outer scope re-rendered, id incremented');
    }
    expect(idAfter).toBe(idBefore);
  }, 30_000);
});
