import { describe, expect, it } from 'vitest';
import { moduleIdFromUrl } from '../src/setup-ember-hmr';

describe('moduleIdFromUrl', () => {
  it('strips a root-relative browser URL down to the app-relative id', () => {
    expect(
      moduleIdFromUrl(
        'http://localhost:4200/app/templates/application.hbs?t=123',
      ),
    ).toBe('app/templates/application.hbs');
  });

  it('strips vite base and host from a non-root browser URL', () => {
    expect(
      moduleIdFromUrl(
        'https://example.test/my-app/app/templates/application.hbs?t=123',
      ),
    ).toBe('app/templates/application.hbs');
  });

  // Regression test: outside of vite's own dev server (e.g. a Node ESM
  // loader running the app directly against on-disk `file://` URLs) there
  // is no server `base` to strip, so `id` was left as the full OS path up
  // to the project root (e.g. `Users/me/project/app/templates/...`) instead
  // of `app/templates/...`. Consumers like ViteHotReloadService key off ids
  // that `startsWith('app/templates/')`, so route/template HMR silently
  // never fired in that setup.
  it('re-anchors an absolute file:// URL to the app-relative id', () => {
    expect(
      moduleIdFromUrl(
        'file:///Users/me/project/app/templates/application.gjs?v=abc123',
      ),
    ).toBe('app/templates/application.gjs');
  });

  it('re-anchors an absolute file:// URL for an in-repo addon', () => {
    expect(
      moduleIdFromUrl(
        'file:///Users/me/project/lib/my-addon/addon/routes/index.ts',
      ),
    ).toBe('addon/routes/index.ts');
  });

  it('leaves an already app-relative id untouched', () => {
    expect(moduleIdFromUrl('app/services/store.js')).toBe(
      'app/services/store.js',
    );
  });
});
