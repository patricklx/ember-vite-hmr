import Service from '@ember/service';

// Regression repro for https://github.com/patricklx/ember-vite-hmr/issues/549
// (Case 1): a service using a native private field. Calling a method that
// touches `#flags` used to crash because ember-vite-hmr's generated HMR
// proxy invoked the method with `this` bound to the proxy instead of the
// real delegate, and private fields aren't reachable through a Proxy.
export default class FlagsService extends Service {
  #flags: Record<string, boolean> = {};

  setFlag(key: string, value: boolean) {
    this.#flags[key] = value;
  }

  getFlag(key: string) {
    return this.#flags[key];
  }
}

declare module '@ember/service' {
  interface Registry {
    flags: FlagsService;
  }
}
