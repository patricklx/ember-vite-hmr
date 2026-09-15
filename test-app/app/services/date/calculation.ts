import BaseDateService from './base';

// Regression repro for https://github.com/patricklx/ember-vite-hmr/issues/549
// (Case 2): `calculation.js`'s superclass isn't literally named `Service`, so
// the babel plugin never HMR-proxies this class itself -- at runtime it
// extends `base.ts`'s generated HMR proxy directly. `today` (a class field)
// used to land on the proxy target instead of its delegate (class fields are
// installed via [[DefineOwnProperty]], which bypasses the proxy's `set`
// trap), and `someMethod` (a prototype method) was unreachable because the
// old `get` trap always forwarded to the delegate instead of falling back
// to the real prototype chain.
export default class DateCalculationService extends BaseDateService {
  today = () => 'calculated-today';

  someMethod() {
    return 'some-method-result';
  }
}

declare module '@ember/service' {
  interface Registry {
    'date/calculation': DateCalculationService;
  }
}
