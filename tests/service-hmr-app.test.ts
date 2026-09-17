import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { startVite } from './utils';

// Reproduces https://github.com/patricklx/ember-vite-hmr/issues/549 end-to-end
// against the committed `test-app`, which is wired to the local library via
// the workspace (`ember-vite-hmr: workspace:*`).
//
// Both bugs only manifest in vite DEV mode, since the service HMR proxy is
// only installed when `EMBER_VITE_HMR_ENABLED`/`import.meta.hot` are truthy.
// See test-app/app/services/flags.ts and test-app/app/services/date/*.ts for
// the services that reproduce each case.
//
// Services are looked up directly off the running application's container
// (via the ember-inspector hook `window.emberInspectorApps`, which this dev
// build exposes) rather than through template rendering: `{{this.foo}}`
// interpolation in this particular test-app/vite/embroider combination
// doesn't reliably paint into the DOM on first render (confirmed even for
// the pre-existing, unrelated `groupBy` binding on a clean checkout), even
// though the underlying controller property is set correctly. Looking up
// the service instance directly sidesteps that unrelated rendering quirk
// and tests the actual thing in question -- the service HMR proxy.
//
// Run:
//   pnpm install && pnpm build
//   pnpm exec vitest run tests/service-hmr-app.test.ts
// Uses its own port so it can run alongside the other test-app-backed suite.

describe('test-app: service HMR proxy supports private fields and subclassing', () => {
  let ctx: Awaited<ReturnType<typeof startVite>>;

  beforeAll(async () => {
    ctx = await startVite({ cwd: resolve('test-app'), port: 60276 });
  }, 180_000);

  afterAll(async () => {
    await ctx?.stop();
  });

  test('service with a native private field survives the HMR proxy', async () => {
    const errors: string[] = [];
    ctx.page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));

    const result = await ctx.page.evaluate(async () => {
      const app = (
        window as unknown as {
          emberInspectorApps: {
            app: { _applicationInstances: Set<unknown> };
          }[];
        }
      ).emberInspectorApps[0].app;
      const instance = [...app._applicationInstances.values()][0] as {
        __container__: { lookup: (name: string) => unknown };
      };
      const flags = instance.__container__.lookup('service:flags') as {
        setFlag: (k: string, v: boolean) => void;
        getFlag: (k: string) => unknown;
      };
      try {
        flags.setFlag('enabled', true);
        return { ok: true, value: flags.getFlag('enabled') };
      } catch (e) {
        return { ok: false, error: String((e as Error)?.message ?? e) };
      }
    });

    expect(
      errors.join('\n'),
      `unexpected page errors:\n${errors.join('\n')}`,
    ).toBe('');
    expect(result).toEqual({ ok: true, value: true });
  }, 30_000);

  test('service subclass fields and prototype methods survive the HMR proxy', async () => {
    const errors: string[] = [];
    ctx.page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));

    const result = await ctx.page.evaluate(async () => {
      const app = (
        window as unknown as {
          emberInspectorApps: {
            app: { _applicationInstances: Set<unknown> };
          }[];
        }
      ).emberInspectorApps[0].app;
      const instance = [...app._applicationInstances.values()][0] as {
        __container__: { lookup: (name: string) => unknown };
      };
      const dateCalculation = instance.__container__.lookup(
        'service:date/calculation',
      ) as {
        today: () => string;
        someMethod: () => string;
        baseMethod: () => string;
        baseValue: string;
      };
      try {
        return {
          ok: true,
          today: dateCalculation.today(),
          someMethod: dateCalculation.someMethod(),
          baseMethod: dateCalculation.baseMethod(),
          baseValue: dateCalculation.baseValue,
        };
      } catch (e) {
        return { ok: false, error: String((e as Error)?.message ?? e) };
      }
    });

    expect(
      errors.join('\n'),
      `unexpected page errors:\n${errors.join('\n')}`,
    ).toBe('');
    expect(result).toEqual({
      ok: true,
      today: 'calculated-today',
      someMethod: 'some-method-result',
      baseMethod: 'overridden-method-result',
      baseValue: 'base-value',
    });
  }, 30_000);

  test('subclass fields survive an in-place HMR swap of the base service', async () => {
    // Edits a module in test-app on disk while the dev server is running,
    // rather than re-navigating: services hot-swap their delegate in place
    // (unlike routes/controllers in this test-app/vite setup, per the note
    // in test-app.test.ts) -- import.meta.hot.accept() constructs a fresh
    // base-class delegate and syncs state from the old one, so this is what
    // actually exercises that sync path rather than just initial construction.
    const basePath = resolve('test-app/app/services/date/base.ts');
    const original = readFileSync(basePath, 'utf8');

    const errors: string[] = [];
    ctx.page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));

    try {
      writeFileSync(
        basePath,
        original.replace("'base-value'", "'base-value-edited'"),
      );

      // HMR is asynchronous; poll for the edit to land rather than assuming
      // a fixed delay is enough.
      const deadline = Date.now() + 10_000;
      let result: Record<string, unknown> = {};
      while (Date.now() < deadline) {
        result = await ctx.page.evaluate(() => {
          const app = (
            window as unknown as {
              emberInspectorApps: {
                app: { _applicationInstances: Set<unknown> };
              }[];
            }
          ).emberInspectorApps[0].app;
          const instance = [...app._applicationInstances.values()][0] as {
            __container__: { lookup: (name: string) => unknown };
          };
          const dateCalculation = instance.__container__.lookup(
            'service:date/calculation',
          ) as {
            today: () => string;
            someMethod: () => string;
            baseMethod: () => string;
            baseValue: string;
          };
          try {
            return {
              ok: true,
              today: dateCalculation.today(),
              someMethod: dateCalculation.someMethod(),
              baseMethod: dateCalculation.baseMethod(),
              baseValue: dateCalculation.baseValue,
            };
          } catch (e) {
            return { ok: false, error: String((e as Error)?.message ?? e) };
          }
        });
        if (result.baseValue === 'base-value-edited') break;
        await new Promise((r) => globalThis.setTimeout(r, 200));
      }

      expect(
        errors.join('\n'),
        `unexpected page errors:\n${errors.join('\n')}`,
      ).toBe('');
      expect(result).toEqual({
        ok: true,
        today: 'calculated-today',
        someMethod: 'some-method-result',
        baseMethod: 'overridden-method-result',
        baseValue: 'base-value-edited',
      });
    } finally {
      writeFileSync(basePath, original);
    }
  }, 30_000);

  // Reproduces https://github.com/patricklx/ember-vite-hmr/issues/560:
  // own-property function fields (arrow fields, modifier()/helper() results)
  // must keep their original identity through the HMR proxy, not a fresh
  // bound copy. Also covers PR #561's own documented tradeoff (a plain,
  // non-arrow own-property function reading a `#private` field, via
  // `readSecretPlain`), now closed by rewriting undecorated private class
  // members to Symbol-keyed properties. See
  // test-app/app/services/fn-identity.ts.
  test('own-property function fields keep their identity through the HMR proxy', async () => {
    const errors: string[] = [];
    ctx.page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));

    const result = await ctx.page.evaluate(async () => {
      const app = (
        window as unknown as {
          emberInspectorApps: {
            app: { _applicationInstances: Set<unknown> };
          }[];
        }
      ).emberInspectorApps[0].app;
      const instance = [...app._applicationInstances.values()][0] as {
        __container__: { lookup: (name: string) => unknown };
      };
      const svc = instance.__container__.lookup('service:fn-identity') as {
        taggedFn: () => string;
        readSecret: () => string;
        readSecretPlain: () => string;
        lookupManager: (fn: object) => string | undefined;
      };
      try {
        return {
          ok: true,
          manager: svc.lookupManager(svc.taggedFn),
          called: svc.taggedFn(),
          secret: svc.readSecret(),
          secretPlain: svc.readSecretPlain(),
        };
      } catch (e) {
        return { ok: false, error: String((e as Error)?.message ?? e) };
      }
    });

    expect(
      errors.join('\n'),
      `unexpected page errors:\n${errors.join('\n')}`,
    ).toBe('');
    expect(result).toEqual({
      ok: true,
      manager: 'manager',
      called: 'called',
      secret: 'private-value',
      secretPlain: 'private-value',
    });
  }, 30_000);
});
