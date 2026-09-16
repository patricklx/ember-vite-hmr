import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { startVite } from './utils';

// Reproduces the "inherited templates silently dropping named blocks" gap
// identified in https://github.com/patricklx/ember-vite-hmr/issues/564's
// feasibility-analysis comment: `BlockChild` (test-app/app/components/
// block-child.ts) has no template of its own and inherits one from
// `BlockBase` (test-app/app/components/block-base.gts) purely via `extends`.
// `lib/hmr.ts`'s yield detection used to only ever scan a wrapped
// component's own file for `{{yield ... to="..."}}` usage, so it never saw
// any named block declared on an inherited template -- every named block
// other than "default" was silently dropped for a component like this one.
//
// Uses its own port so it can run alongside the other test-app-backed
// suites (see the repo's note on port-race flakiness when running them
// concurrently -- run this file individually).

describe('test-app: named blocks survive HMR for a component with an inherited template', () => {
  let ctx: Awaited<ReturnType<typeof startVite>>;

  beforeAll(async () => {
    ctx = await startVite({ cwd: resolve('test-app'), port: 60279 });
  }, 180_000);

  afterAll(async () => {
    await ctx?.stop();
  });

  test('a named block declared only on the ancestor class renders through the child', async () => {
    const errors: string[] = [];
    ctx.page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));

    await ctx.page.click('.nav-equipment');
    await ctx.page.waitForSelector('.equipment-page');
    await ctx.page.waitForSelector('.block-base-default');

    expect(errors.join('\n')).toBe('');
    expect(await ctx.page.textContent('.block-base-default')).toContain(
      'block default content',
    );
    expect(await ctx.page.textContent('.block-base-footer')).toContain(
      'block footer content',
    );
  }, 30_000);

  test('a named block added to the ancestor after the fact propagates without a full reload', async () => {
    // BlockChild's virtual HMR wrapper caches its detected named blocks
    // under the ancestor's (BlockBase's) resolved file id, not its own --
    // this is exactly the code path the fix touches (see
    // `resolveYieldSource` in lib/hmr.ts). Editing BlockBase on disk and
    // polling for the newly-added block to appear (rather than reloading
    // the page) is what exercises that cache invalidation.
    const basePath = resolve('test-app/app/components/block-base.gts');
    const original = readFileSync(basePath, 'utf8');

    const errors: string[] = [];
    ctx.page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));

    try {
      expect(await ctx.page.$('.block-base-header')).toBeNull();

      writeFileSync(
        basePath,
        original.replace(
          '<div class="block-base-footer">{{yield to="footer"}}</div>',
          '<div class="block-base-footer">{{yield to="footer"}}</div>\n    <div class="block-base-header">{{yield to="header"}}</div>',
        ),
      );

      const deadline = Date.now() + 10_000;
      let headerText: string | null = null;
      while (Date.now() < deadline) {
        const el = await ctx.page.$('.block-base-header');
        if (el) {
          headerText = await el.textContent();
          if (headerText) {
            break;
          }
        }
        await new Promise((r) => globalThis.setTimeout(r, 200));
      }

      expect(
        errors.join('\n'),
        `unexpected page errors:\n${errors.join('\n')}`,
      ).toBe('');
      expect(headerText).toBe('block header content');
    } finally {
      writeFileSync(basePath, original);
    }
  }, 30_000);

  test('editing the template-less child itself does not drop the inherited named block', async () => {
    // The fix moves BlockChild's cached yields off of its own (template-less)
    // file and onto BlockBase's -- confirm that side effect doesn't regress
    // an ordinary edit to the child itself (e.g. adding a method): its own
    // HMR swap must still curry into a wrapper that forwards the named block
    // it inherits from BlockBase, not silently drop back to "default" only.
    const childPath = resolve('test-app/app/components/block-child.ts');
    const original = readFileSync(childPath, 'utf8');

    const errors: string[] = [];
    ctx.page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));

    try {
      writeFileSync(
        childPath,
        original.replace(
          'export default class BlockChild extends BlockBase {}',
          'export default class BlockChild extends BlockBase {\n  someMethod() {\n    return true;\n  }\n}',
        ),
      );

      const deadline = Date.now() + 10_000;
      let footerText: string | null = null;
      while (Date.now() < deadline) {
        footerText = await ctx.page.textContent('.block-base-footer');
        if (footerText === 'block footer content') {
          break;
        }
        await new Promise((r) => globalThis.setTimeout(r, 200));
      }

      expect(
        errors.join('\n'),
        `unexpected page errors:\n${errors.join('\n')}`,
      ).toBe('');
      expect(footerText).toBe('block footer content');
    } finally {
      writeFileSync(childPath, original);
    }
  }, 30_000);
});
