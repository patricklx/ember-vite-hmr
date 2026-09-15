import Service from '@ember/service';

// Regression repro for https://github.com/patricklx/ember-vite-hmr/issues/549
// (Case 2): a base service class that gets HMR-proxied by ember-vite-hmr
// (it directly extends Service), subclassed from another service module.
export default class BaseDateService extends Service {
  baseValue = 'base-value';
}
