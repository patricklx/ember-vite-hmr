import { describe, expect, it } from 'vitest';
import { hmr } from '../lib/hmr';

// `@ember/component/template-only` is injected by the template compiler into
// a template-only component's (a bare `<template>` export, no backing class)
// compiled output, so the scanner - which only sees pre-compile source - can't
// find it. Without pre-declaring it, the browser requests it on boot, Vite
// discovers a "new" dep and triggers a re-optimize + full page reload.
//
// The dep must be declared as the Embroider-rewritten `ember-source/...`
// subpath — the bare specifier cannot be resolved by optimizeDeps.include.
describe('hmr() optimizeDeps declaration', () => {
  // hmr() returns [hmrRuntime(), mainPlugin]; config hook lives on mainPlugin
  const callConfig = (
    plugins: ReturnType<typeof hmr>,
    mode: string,
    config: unknown = {},
  ) => {
    const plugin = plugins[1];
    const hook = plugin.config as (
      config: unknown,
      env: { mode: string; command: string },
    ) => { optimizeDeps?: { include?: string[] } } | undefined;
    return hook(config, { mode, command: 'serve' });
  };

  it('pre-bundles template-only dep the scanner cannot see (enabled mode)', () => {
    const result = callConfig(hmr(['development']), 'development');

    expect(result?.optimizeDeps?.include).toEqual([
      'ember-source/@ember/component/template-only.js',
    ]);
  });

  it('does not touch optimizeDeps when HMR is disabled for the mode', () => {
    const result = callConfig(hmr(['development']), 'production');

    expect(result).toBeUndefined();
  });

  // Regression test for #554: forcing these into optimizeDeps.include under
  // `noDiscovery: true` produced a second, separately pre-bundled copy of
  // the glimmer VM (nothing else gets scanned/optimized in that mode),
  // crashing with "The global context for Glimmer VM was not set".
  it('does not touch optimizeDeps when the user has set optimizeDeps.noDiscovery', () => {
    const result = callConfig(hmr(['development']), 'development', {
      optimizeDeps: { noDiscovery: true },
    });

    expect(result).toBeUndefined();
  });
});
