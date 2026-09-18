import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

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

  // A regular (non-private) `@tracked` field, coexisting in the same class
  // as the undecorated `#secret` private field above. `decorator-transforms`
  // rewrites this into its own, separately-named native private backing
  // field once it runs (after ember-vite-hmr's own babel plugin, which has
  // already rewritten `#secret` to a plain property by then) -- exercises
  // that the two rewrites don't interfere with each other and that tracked
  // reads/writes still work correctly through the HMR proxy's get/set
  // traps.
  @tracked count = 0;

  increment() {
    this.count++;
  }

  // A *decorated* private field: `@tracked #x` used to be left fully
  // native, since decorator-transforms has no visitor for a decorator
  // attached directly to a `#private` member, and rewriting it to a
  // Symbol-keyed property (as an earlier version of this rewrite did for
  // undecorated members) doesn't fix that -- Ember's `@tracked` detects a
  // native-decorator call by checking `typeof key === 'string'`, so a
  // Symbol key makes it silently fall through to the wrong branch and never
  // track at all. ember-vite-hmr's babel plugin now rewrites every private
  // member -- decorated or not -- to a plain, uniquely-named property,
  // which satisfies that check, so `@tracked #trackedSecret` tracks exactly
  // like an ordinary public `@tracked` field.
  @tracked #trackedSecret = 0;

  incrementTrackedSecret() {
    this.#trackedSecret++;
  }

  // Own-property function field: must keep its identity through the proxy.
  taggedFn = associate(() => 'called');

  // Own-property arrow field relying on lexical `this` to reach `#secret`.
  readSecret = () => this.#secret;

  // A plain (non-arrow) function assigned as an own property in the
  // constructor, reading `#secret` via a dynamic `this`. PR #561 documented
  // this as a known, accepted tradeoff of leaving own-property functions
  // unbound: called through the proxy, `this` is the proxy (not the
  // delegate), and native private fields throw unless `this` is literally
  // the declaring instance. ember-vite-hmr's babel plugin now rewrites
  // `#private` members declared directly on a service into a plain
  // property instead, which reads correctly through the proxy's existing
  // traps regardless of what `this` is bound to at the call site.
  readSecretPlain: () => string;

  // Same tradeoff, but for the decorated `#trackedSecret` above -- reading a
  // tracked private field's current value through a dynamic `this`.
  readTrackedSecretPlain: () => number;

  constructor(...args: [unknown]) {
    super(...args);
    this.readSecretPlain = function (this: FnIdentityService) {
      return this.#secret;
    };
    this.readTrackedSecretPlain = function (this: FnIdentityService) {
      return this.#trackedSecret;
    };
  }

  lookupManager(fn: object) {
    return managers.get(fn);
  }
}

declare module '@ember/service' {
  interface Registry {
    'fn-identity': FnIdentityService;
  }
}
