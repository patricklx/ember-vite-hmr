import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'path';
import { startVite } from './utils';

// Reproduces https://github.com/patricklx/ember-vite-hmr/issues/552 end-to-end
// against the committed `test-app`, which is wired to the local library via
// the workspace (`ember-vite-hmr: workspace:*`).
//
// Every Glimmer component ember-vite-hmr hot-wraps is rendered through a
// generated `HotComponent` (see `getHotComponent` in `lib/hmr.ts`), which
// used to show up as its own extra node in ember-inspector's Component Tree
// for every single component in the app -- pure noise, since it's not a
// component authors wrote. The fix makes the shadow component manager
// installed on `HotComponent` implement Glimmer's `getDebugCustomRenderTree`
// hook (the same one Ember core uses internally to keep `{{outlet}}`/
// `{{mount}}` wrapper machinery out of that tree) and return no nodes, so
// only the real, wrapped component shows up.
//
// Uses its own port so it can run alongside the other test-app-backed suites.

describe('test-app: HotComponent wrapper is hidden from the debug render tree', () => {
  let ctx: Awaited<ReturnType<typeof startVite>>;

  beforeAll(async () => {
    ctx = await startVite({ cwd: resolve('test-app'), port: 60277 });
  }, 180_000);

  afterAll(async () => {
    await ctx?.stop();
  });

  test('HotComponent produces no debug-render-tree node, the real component still does', async () => {
    const errors: string[] = [];
    ctx.page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));

    await ctx.page.click('.nav-equipment');
    await ctx.page.waitForSelector('.equipment-page');
    await ctx.page.waitForSelector('.greeting');

    const ctorNames = await ctx.page.evaluate(() => {
      const app = (
        window as unknown as {
          emberInspectorApps: {
            app: { _applicationInstances: Set<unknown> };
          }[];
        }
      ).emberInspectorApps[0].app;
      const instance = [...app._applicationInstances.values()][0] as {
        lookup: (name: string) => {
          debugRenderTree: { capture: () => unknown[] };
        };
      };
      const renderer = instance.lookup('renderer:-dom');
      const collected: (string | undefined)[] = [];
      const visit = (nodes: unknown[]) => {
        for (const node of nodes as {
          type?: string;
          instance?: { constructor?: { name?: string } };
          children: unknown[];
        }[]) {
          if (node.type === 'component') {
            collected.push(node.instance?.constructor?.name);
          }
          visit(node.children);
        }
      };
      visit(renderer.debugRenderTree.capture());
      return collected;
    });

    expect(errors.join('\n')).toBe('');
    // The generated HMR wrapper must not add its own node to the tree...
    expect(ctorNames).not.toContain('HotComponent');
    // ...but the real, wrapped component still must.
    expect(ctorNames).toContain('Greeting');
  }, 30_000);
});
