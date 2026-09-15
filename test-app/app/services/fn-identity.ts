import Service from '@ember/service';

// Regression repro for https://github.com/patricklx/ember-vite-hmr/issues/560:
// ember-vite-hmr's service HMR proxy used to call `.bind(delegate)` on every
// function-valued property read off the delegate, including own-property
// function fields (arrow-function class fields, `modifier()`/`helper()`
// results, component classes, etc.). `bind()` returns a brand-new function
// object, so anything that associates metadata with the exact function
// object via a WeakMap (like ember-modifier's `modifier()`) silently loses
// that association. `managers` below stands in for that WeakMap without
// pulling in ember-modifier as a dependency.
const managers = new WeakMap<object, string>();
function associate<T extends object>(fn: T): T {
  managers.set(fn, 'manager');
  return fn;
}

export default class FnIdentityService extends Service {
  #secret = 'private-value';

  // Own-property function field: must keep its identity through the proxy.
  taggedFn = associate(() => 'called');

  // Own-property arrow field relying on lexical `this` to reach `#secret`.
  readSecret = () => this.#secret;

  lookupManager(fn: object) {
    return managers.get(fn);
  }
}

declare module '@ember/service' {
  interface Registry {
    'fn-identity': FnIdentityService;
  }
}
