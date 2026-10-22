import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'path';
import { readFile, writeFile } from 'fs-extra';
import { startVite } from './utils';

// Tests that syncState correctly pairs old→new instances when:
//   A) Multiple side-by-side invocations of the same component exist (the FIFO
//      queue must pair A₁_old→A₁_new and A₂_old→A₂_new, not mix them up).
//   B) The component has been created and destroyed by normal user-flow
//      navigation between saves (stale queue entries must not pollute the
//      pairing for the next real HMR swap).
//
// Uses two <MultiCounter /> components on the equipment page and a
// navigate-away/back cycle to exercise both cases. MultiCounter is a dedicated
// test-only component so its HMR tests don't interfere with ResourceHolder's.

describe('test-app: syncState with multiple instances and user-flow navigation', () => {
  let ctx: Awaited<ReturnType<typeof startVite>>;
  const componentPath = resolve('test-app/app/components/multi-counter.gts');
  let originalContent: string;

  beforeAll(async () => {
    originalContent = (await readFile(componentPath)).toString();
    ctx = await startVite({ cwd: resolve('test-app'), port: 60295 });
  }, 180_000);

  afterAll(async () => {
    await writeFile(componentPath, originalContent);
    await ctx?.stop();
  });

  // Helper: click the nth increment button (0-based).
  async function increment(n: number, times = 1) {
    for (let i = 0; i < times; i++) {
      await ctx.page.locator('.multi-counter-increment').nth(n).click();
    }
  }

  // Helper: read the nth count text (0-based).
  async function count(n: number): Promise<string> {
    return (await ctx.page.evaluate(
      (idx) =>
        document.querySelectorAll('.multi-counter-count')[idx]?.textContent ?? '',
      n,
    )).trim();
  }

  test('state is transferred to the correct instance when two are side-by-side', async () => {
    const errors: string[] = [];
    ctx.page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));

    await ctx.page.click('.nav-equipment');
    await ctx.page.waitForSelector('.equipment-page');
    await ctx.page.waitForFunction(
      () => document.querySelectorAll('.multi-counter-increment').length === 2,
    );

    // Increment first to 2, second to 5.
    await increment(0, 2);
    await increment(1, 5);

    expect(await count(0)).toBe('2');
    expect(await count(1)).toBe('5');

    // Trigger HMR.
    await writeFile(
      componentPath,
      originalContent.replace('label: counter', 'label: counter v2'),
    );
    await ctx.page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('.multi-counter')).every(
          (el) => el.textContent === 'label: counter v2',
        ),
      { timeout: 10_000 },
    );
    // Give syncState's deferred setTimeout a moment to apply.
    await new Promise((r) => setTimeout(r, 300));

    // Each instance must keep its own count — not each other's.
    expect(await count(0)).toBe('2');
    expect(await count(1)).toBe('5');

    expect(errors.join('\n')).toBe('');
  }, 60_000);

  test('state is correct after navigate-away/back between saves', async () => {
    const errors: string[] = [];
    ctx.page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));

    // Restore original content and navigate away so the components are fully
    // torn down with no lingering state.
    await writeFile(componentPath, originalContent);
    await ctx.page.click('.nav-index');
    await ctx.page.waitForSelector('.nav-equipment');

    // Navigate back — fresh instances, counts start at 0.
    await ctx.page.click('.nav-equipment');
    await ctx.page.waitForSelector('.equipment-page');
    await ctx.page.waitForFunction(
      () =>
        document.querySelectorAll('.multi-counter-increment').length === 2 &&
        Array.from(document.querySelectorAll('.multi-counter')).every(
          (el) => el.textContent === 'label: counter',
        ),
      { timeout: 10_000 },
    );

    // Set first=3, second=7.
    await increment(0, 3);
    await increment(1, 7);
    expect(await count(0)).toBe('3');
    expect(await count(1)).toBe('7');

    // Navigate away — components are destroyed. Without the update()-time reset,
    // these instances would sit in the queue as stale entries and get paired
    // with the wrong new instances after the HMR swap below.
    await ctx.page.click('.nav-index');
    await ctx.page.waitForSelector('.nav-equipment');

    // Navigate back — fresh instances created.
    await ctx.page.click('.nav-equipment');
    await ctx.page.waitForSelector('.equipment-page');
    await ctx.page.waitForFunction(
      () => document.querySelectorAll('.multi-counter-increment').length === 2,
    );

    // Counts reset to 0 on navigation (new instances).
    expect(await count(0)).toBe('0');
    expect(await count(1)).toBe('0');

    // Set new values: first=4, second=8.
    await increment(0, 4);
    await increment(1, 8);
    expect(await count(0)).toBe('4');
    expect(await count(1)).toBe('8');

    // Trigger HMR. The queue must only contain instances created AFTER
    // update() fires — the stale entries from before navigation are gone.
    await writeFile(
      componentPath,
      originalContent.replace('label: counter', 'label: counter v3'),
    );
    await ctx.page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('.multi-counter')).every(
          (el) => el.textContent === 'label: counter v3',
        ),
      { timeout: 10_000 },
    );
    await new Promise((r) => setTimeout(r, 300));

    // Each instance must have its post-navigation count, not pre-navigation.
    expect(await count(0)).toBe('4');
    expect(await count(1)).toBe('8');

    expect(errors.join('\n')).toBe('');
  }, 60_000);
});
