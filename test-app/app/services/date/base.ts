import Service from '@ember/service';

// Regression repro for https://github.com/patricklx/ember-vite-hmr/issues/549
// (Case 2): a base service class that gets HMR-proxied by ember-vite-hmr
// (it directly extends Service), subclassed from another service module.
export default class BaseDateService extends Service {
  baseValue = 'base-value';

  baseMethod() {
    return 'base-method-result';
  }

  // Regression repro for an "ancestor private property": `#basePrivate` is
  // declared here, on the class a *different* service (date/calculation.ts)
  // subclasses -- not on the subclass itself. `readBasePrivatePlain`, a
  // plain (non-arrow) own-property function reading it via a dynamic `this`,
  // is the exact PR #561/#560 tradeoff that used to be unfixable for an
  // ancestor: it lives in a different file than the subclass, so no
  // per-service transform could ever reach it. ember-vite-hmr's babel plugin
  // now rewrites every class's private members generically (see the `Class`
  // visitor in lib/babel-plugin.ts), including this one, so it reads
  // correctly through the proxy regardless of which instance -- the base
  // service's own proxy, or a subclass instance built on top of it -- `this`
  // is bound to at the call site.
  #basePrivate = 'base-private-value';

  readBasePrivatePlain: () => string;

  constructor(...args: [unknown]) {
    super(...args);
    this.readBasePrivatePlain = function (this: BaseDateService) {
      return this.#basePrivate;
    };
  }
}
