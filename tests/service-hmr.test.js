import babel from '@babel/core';
import { describe, expect, it } from 'vitest';
import plugin from '../lib/babel-plugin.ts';

process.env['EMBER_VITE_HMR_ENABLED'] = 'true';

// Strip Babel helper function declarations that change signature between
// @babel/helpers releases — they're irrelevant to the HMR transformation.
const stripBabelHelpers = (code) =>
  code
    .replace(/^function applyDecs2203RFactory\(\).*\n/m, '')
    .replace(/^function _toPrimitive\(.*\n/m, '')
    .replace(/^function _toPropertyKey\(.*\n/m, '')
    .replace(/^function _applyDecs2203R\(.*\n/m, '')
    .replace(/^function _setFunctionName\(.*\n/m, '');

describe('Service HMR transformation', () => {
  it('should transform a service class to HMR-enabled version', async () => {
    const code = `
import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

class TestService extends Service {
  @tracked counter = 0;
  @tracked message = 'Hello from test service';

  get message2() {
    return "Hi 14"
  }

  incrementCounter() {
    this.counter++;
  }

  updateMessage(newMessage) {
    this.message = newMessage;
  }

  reset() {
    this.counter = 0;
    this.message = 'Hello from test service';
  }
}

export default TestService;
    `;

    const result = await babel.transformAsync(code, {
      filename: '/rewritten-app/app/services/test-service.js',
      babelrc: false,
      configFile: false,
      plugins: [
        ['@babel/plugin-proposal-decorators', { version: '2022-03' }],
        plugin,
      ],
    });

    // Verify the transformation includes key HMR components
    expect(result.code).toContain('TestServiceHmrProxy');
    expect(result.code).toContain('class TestService extends');
    expect(result.code).toContain('import.meta.hot.data._proxy');
    expect(result.code).toContain('import.meta.hot.data._impl');
    expect(result.code).toContain('import.meta.hot');
    expect(result.code).toContain('new Proxy');
    expect(result.code).toContain('static Impl');
    expect(result.code).toContain('_delegate');
    expect(result.code).toContain('willDestroy');

    expect(stripBabelHelpers(result.code)).toMatchInlineSnapshot(`
      "let _init_counter, _init_message, _init__delegate;
      import Service from '@ember/service';
      import { tracked } from '@glimmer/tracking';
      class TestService extends Service {
        static {
          [_init_counter, _init_message] = _applyDecs2203R(this, [[tracked, 0, "counter"], [tracked, 0, "message"]], []).e;
        }
        counter = _init_counter(this, 0);
        message = _init_message(this, 'Hello from test service');
        get message2() {
          return "Hi 14";
        }
        incrementCounter() {
          this.counter++;
        }
        updateMessage(newMessage) {
          this.message = newMessage;
        }
        reset() {
          this.counter = 0;
          this.message = 'Hello from test service';
        }
      }
      export default class TestServiceHmrProxy extends Service {
        static {
          [_init__delegate] = _applyDecs2203R(this, [[tracked, 0, "_delegate"]], []).e;
        }
        static Impl = TestService;
        _delegate = _init__delegate(this);
        constructor(...args) {
          super(...args);
          this._owner = args[0];
          const Impl = import.meta.hot && import.meta.hot.data._impl || TestServiceHmrProxy.Impl;
          this._delegate = new Impl(this._owner);
          if (import.meta.hot) {
            import.meta.hot.data._proxy = this;
          }
          return new Proxy(this, {
            get(target, prop, receiver) {
              if (prop === '_delegate') {
                return target._delegate;
              }
              let proto = Object.getPrototypeOf(target);
              while (proto && proto !== TestServiceHmrProxy.prototype) {
                if (Object.prototype.hasOwnProperty.call(proto, prop)) {
                  return Reflect.get(target, prop, receiver);
                }
                proto = Object.getPrototypeOf(proto);
              }
              const delegate = target._delegate;
              if (prop in delegate) {
                return delegate[prop];
              }
              return Reflect.get(target, prop, receiver);
            },
            set(target, prop, value) {
              target._delegate[prop] = value;
              return true;
            },
            defineProperty(target, prop, descriptor) {
              return Reflect.defineProperty(target._delegate, prop, descriptor);
            }
          });
        }
        willDestroy() {
          super.willDestroy();
          this._delegate.willDestroy();
          if (import.meta.hot && import.meta.hot.data._proxy === this) {
            import.meta.hot.data._proxy = undefined;
          }
        }
      }
      if (import.meta.hot) {
        import.meta.hot.accept(newModule => {
          const NewImpl = newModule?.default?.Impl;
          if (!NewImpl) {
            return;
          }
          import.meta.hot.data._impl = NewImpl;
          const proxy = import.meta.hot.data._proxy;
          if (!proxy) {
            return;
          }
          const oldDelegate = proxy._delegate;
          const newDelegate = new NewImpl(proxy._owner);
          proxy._delegate = newDelegate;
          const keysToSync = new Set();
          for (const key in oldDelegate) {
            keysToSync.add(key);
          }
          for (const key of Object.getOwnPropertyNames(oldDelegate)) {
            keysToSync.add(key);
          }
          for (const key of keysToSync) {
            const descriptor = Object.getOwnPropertyDescriptor(oldDelegate, key) || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(oldDelegate), key);
            const hasOwnDefault = Object.prototype.hasOwnProperty.call(newDelegate, key);
            const currentValue = newDelegate[key];
            const previousValue = oldDelegate[key];
            if (previousValue instanceof Service) {
              continue;
            }
            if (typeof previousValue === 'function' && hasOwnDefault) {
              continue;
            }
            const shouldSync = !!descriptor && (descriptor.writable || descriptor.set || Object.prototype.hasOwnProperty.call(oldDelegate, key)) && (!hasOwnDefault || currentValue === previousValue);
            if (shouldSync) {
              try {
                newDelegate[key] = previousValue;
              } catch (e) {}
            }
          }
          newDelegate._hmrAccepted?.(oldDelegate);
          if (oldDelegate.willDestroy) {
            oldDelegate.willDestroy();
          }
        });
      }"
    `);
  });

  it('should not transform non-service classes', async () => {
    const code = `
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';

export default class MyComponent extends Component {
  @tracked count = 0;
}
    `;

    const result = await babel.transformAsync(code, {
      filename: '/rewritten-app/app/components/my-component.js',
      babelrc: false,
      configFile: false,
      plugins: [
        ['@babel/plugin-proposal-decorators', { version: '2022-03' }],
        plugin,
      ],
    });

    // Should not contain HMR transformation
    expect(result.code).not.toContain('CurrentImpl');
    expect(result.code).not.toContain('currentProxy');
    expect(result.code).not.toContain('_hotReload');
  });

  it('should not transform services when HMR is disabled', async () => {
    const originalEnv = process.env['EMBER_VITE_HMR_ENABLED'];
    process.env['EMBER_VITE_HMR_ENABLED'] = 'false';

    const code = `
import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class TestService extends Service {
  @tracked counter = 0;
}
    `;

    const result = await babel.transformAsync(code, {
      filename: '/rewritten-app/app/services/test-service.js',
      babelrc: false,
      configFile: false,
      plugins: [
        ['@babel/plugin-proposal-decorators', { version: '2022-03' }],
        plugin,
      ],
    });

    // Should not contain HMR transformation
    expect(result.code).not.toContain('CurrentImpl');
    expect(result.code).not.toContain('currentProxy');

    process.env['EMBER_VITE_HMR_ENABLED'] = originalEnv;
  });

  it('should handle service with no decorators', async () => {
    const code = `
import Service from '@ember/service';

export default class SimpleService extends Service {
  getValue() {
    return 42;
  }
}
    `;

    const result = await babel.transformAsync(code, {
      filename: '/rewritten-app/app/services/simple-service.js',
      babelrc: false,
      configFile: false,
      plugins: [
        ['@babel/plugin-proposal-decorators', { version: '2022-03' }],
        plugin,
      ],
    });

    // Should still contain HMR transformation
    expect(result.code).toContain('SimpleServiceHmrProxy');
    expect(result.code).toContain('class SimpleService extends');
    expect(result.code).toContain('import.meta.hot');
  });

  it('should preserve service methods and properties', async () => {
    const code = `
import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class DataService extends Service {
  @tracked data = [];
  
  async fetchData() {
    return fetch('/api/data');
  }
  
  get hasData() {
    return this.data.length > 0;
  }
}
    `;

    const result = await babel.transformAsync(code, {
      filename: '/rewritten-app/app/services/data-service.js',
      babelrc: false,
      configFile: false,
      plugins: [
        ['@babel/plugin-proposal-decorators', { version: '2022-03' }],
        plugin,
      ],
    });

    // Verify methods and properties are preserved in the Impl class
    expect(result.code).toContain('fetchData');
    expect(result.code).toContain('hasData');
    expect(result.code).toContain('data');

    expect(stripBabelHelpers(result.code)).toMatchInlineSnapshot(`
      "let _initClass, _init_data, _init__delegate;
      import Service from '@ember/service';
      import { tracked } from '@glimmer/tracking';
      let _DataService;
      class DataService extends Service {
        static {
          ({
            e: [_init_data],
            c: [_DataService, _initClass]
          } = _applyDecs2203R(this, [[tracked, 0, "data"]], []));
        }
        data = _init_data(this, []);
        async fetchData() {
          return fetch('/api/data');
        }
        get hasData() {
          return this.data.length > 0;
        }
        static {
          _initClass();
        }
      }
      export default class DataServiceHmrProxy extends Service {
        static {
          [_init__delegate] = _applyDecs2203R(this, [[tracked, 0, "_delegate"]], []).e;
        }
        static Impl = _DataService;
        _delegate = _init__delegate(this);
        constructor(...args) {
          super(...args);
          this._owner = args[0];
          const Impl = import.meta.hot && import.meta.hot.data._impl || DataServiceHmrProxy.Impl;
          this._delegate = new Impl(this._owner);
          if (import.meta.hot) {
            import.meta.hot.data._proxy = this;
          }
          return new Proxy(this, {
            get(target, prop, receiver) {
              if (prop === '_delegate') {
                return target._delegate;
              }
              let proto = Object.getPrototypeOf(target);
              while (proto && proto !== DataServiceHmrProxy.prototype) {
                if (Object.prototype.hasOwnProperty.call(proto, prop)) {
                  return Reflect.get(target, prop, receiver);
                }
                proto = Object.getPrototypeOf(proto);
              }
              const delegate = target._delegate;
              if (prop in delegate) {
                return delegate[prop];
              }
              return Reflect.get(target, prop, receiver);
            },
            set(target, prop, value) {
              target._delegate[prop] = value;
              return true;
            },
            defineProperty(target, prop, descriptor) {
              return Reflect.defineProperty(target._delegate, prop, descriptor);
            }
          });
        }
        willDestroy() {
          super.willDestroy();
          this._delegate.willDestroy();
          if (import.meta.hot && import.meta.hot.data._proxy === this) {
            import.meta.hot.data._proxy = undefined;
          }
        }
      }
      if (import.meta.hot) {
        import.meta.hot.accept(newModule => {
          const NewImpl = newModule?.default?.Impl;
          if (!NewImpl) {
            return;
          }
          import.meta.hot.data._impl = NewImpl;
          const proxy = import.meta.hot.data._proxy;
          if (!proxy) {
            return;
          }
          const oldDelegate = proxy._delegate;
          const newDelegate = new NewImpl(proxy._owner);
          proxy._delegate = newDelegate;
          const keysToSync = new Set();
          for (const key in oldDelegate) {
            keysToSync.add(key);
          }
          for (const key of Object.getOwnPropertyNames(oldDelegate)) {
            keysToSync.add(key);
          }
          for (const key of keysToSync) {
            const descriptor = Object.getOwnPropertyDescriptor(oldDelegate, key) || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(oldDelegate), key);
            const hasOwnDefault = Object.prototype.hasOwnProperty.call(newDelegate, key);
            const currentValue = newDelegate[key];
            const previousValue = oldDelegate[key];
            if (previousValue instanceof Service) {
              continue;
            }
            if (typeof previousValue === 'function' && hasOwnDefault) {
              continue;
            }
            const shouldSync = !!descriptor && (descriptor.writable || descriptor.set || Object.prototype.hasOwnProperty.call(oldDelegate, key)) && (!hasOwnDefault || currentValue === previousValue);
            if (shouldSync) {
              try {
                newDelegate[key] = previousValue;
              } catch (e) {}
            }
          }
          newDelegate._hmrAccepted?.(oldDelegate);
          if (oldDelegate.willDestroy) {
            oldDelegate.willDestroy();
          }
        });
      }"
    `);
  });

  it('should handle service with separate class declaration and export', async () => {
    const code = `
import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

class TestService extends Service {
  @tracked counter = 0;
  @tracked message = 'Hello from test service';

  get message2() {
    return "Hi 14"
  }

  incrementCounter() {
    this.counter++;
  }

  updateMessage(newMessage) {
    this.message = newMessage;
  }

  reset() {
    this.counter = 0;
    this.message = 'Hello from test service';
  }
}

export default TestService;
    `;

    const result = await babel.transformAsync(code, {
      filename: '/rewritten-app/app/services/test-service.js',
      babelrc: false,
      configFile: false,
      plugins: [
        ['@babel/plugin-proposal-decorators', { version: '2022-03' }],
        plugin,
      ],
    });

    // Verify the transformation includes key HMR components
    expect(result.code).toContain('TestServiceHmrProxy');
    expect(result.code).toContain('class TestService extends');
    expect(result.code).toContain('import.meta.hot.data._proxy');
    expect(result.code).toContain('import.meta.hot.data._impl');
    expect(result.code).toContain('import.meta.hot');
    expect(result.code).toContain('new Proxy');
    expect(result.code).toContain('static Impl');
    expect(result.code).toContain('_delegate');
    expect(result.code).toContain('willDestroy');
  });

  // A native `#private` field/method declared directly on the service class
  // can only ever be accessed with `this` bound to the exact instance that
  // declared it (see PR #561), so every private member -- decorated or not
  // -- is rewritten to a plain, uniquely-named, non-computed property here,
  // which reads/writes correctly through the proxy's `get`/`set` traps no
  // matter what `this` is at the call site. A *decorated* private member
  // (`@tracked #count`) can't be rewritten to a Symbol key instead: Ember's
  // `@tracked` distinguishes a native-decorator call from a
  // `tracked({...})` call by checking `typeof key === 'string'`, so a
  // Symbol-keyed field silently never tracks (verified empirically). A
  // plain string key satisfies that check, so `@tracked #count` is rewritten
  // the same way as any other private member.
  it('rewrites every private member (decorated or not) to a plain, uniquely-named property', async () => {
    const code = `
import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

class TestService extends Service {
  @tracked #count = 0;
  #plain = 'hidden';

  increment() {
    this.#count++;
  }

  readPlain() {
    return this.#plain;
  }

  #helper() {
    return this.#plain;
  }

  hasPlain(o) {
    return #plain in o;
  }
}

export default TestService;
    `;

    // Parses `@tracked` without transforming it -- unlike
    // `@babel/plugin-proposal-decorators` (used elsewhere in this file),
    // which runs its own whole-program pre-pass and would strip the
    // decorator before this plugin's visitor ever saw it, regardless of
    // plugin order. Real host apps run ember-vite-hmr's babel plugin
    // *before* their actual decorator transform (see
    // test-app/babel.config.mjs), so this matches what this plugin's
    // visitor actually sees in practice: the decorator still attached.
    const result = await babel.transformAsync(code, {
      filename: '/rewritten-app/app/services/test-service.js',
      babelrc: false,
      configFile: false,
      plugins: [
        ['@babel/plugin-syntax-decorators', { version: '2022-03' }],
        plugin,
      ],
    });

    // `#plain`/`#helper`: rewritten to a plain, uniquely-named property.
    expect(result.code).toContain('hmrPrivPlain');
    expect(result.code).toContain('hmrPrivHelper');
    expect(result.code).not.toContain('this.#plain');
    expect(result.code).not.toContain('#plain in o');

    // `#count`: also rewritten, decorator preserved so `@tracked` still
    // applies to the renamed property.
    expect(result.code).toContain('hmrPrivCount');
    expect(result.code).not.toContain('this.#count');
    expect(result.code).toMatch(/@tracked\s*\n\s*_hmrPrivCount/);

    // `#plain` (undecorated): also hidden from enumeration, via a
    // constructor-appended `Object.defineProperty(..., { enumerable: false
    // })` -- see the "hideRenamedProperties" comment in
    // lib/babel-plugin/private-members.ts for why a class field can't
    // declare this directly.
    expect(result.code).toMatch(
      /Object\.defineProperty\(this, ["'](_?\w*hmrPrivPlain)["'], \{\s*value: this\.\1,\s*writable: true,\s*configurable: true,\s*enumerable: false\s*\}\)/,
    );

    // `#count` (decorated): `@tracked` turns it into a prototype accessor,
    // not an instance data property, so there's nothing for
    // `Object.defineProperty` to hide -- must NOT get the same treatment.
    // Only one `Object.defineProperty(..., { enumerable: false })` call
    // should exist at all (for `#plain`).
    expect(
      result.code.match(/Object\.defineProperty\(this, ["']\w+["']/g),
    ).toHaveLength(1);
    expect(result.code).not.toMatch(
      /defineProperty\(this, ["']_?\w*hmrPrivCount["']/,
    );
  });

  // A class with no explicit constructor needs one synthesized so the
  // `Object.defineProperty(..., { enumerable: false })` call has somewhere
  // to live; the synthesized constructor must forward its arguments to
  // `super` exactly like the implicit default derived-class constructor
  // would, so nothing else about construction changes.
  it('synthesizes a constructor (forwarding args to super) for a class with an undecorated private field and no constructor of its own', async () => {
    const code = `
import Service from '@ember/service';

class TestService extends Service {
  #plain = 'hidden';

  readPlain() {
    return this.#plain;
  }
}

export default TestService;
    `;

    const result = await babel.transformAsync(code, {
      filename: '/rewritten-app/app/services/test-service.js',
      babelrc: false,
      configFile: false,
      plugins: [plugin],
    });

    expect(result.code).toMatch(
      /constructor\(\.\.\.args\)\s*\{\s*super\(\.\.\.args\);\s*Object\.defineProperty/,
    );
  });

  // Regression test: an existing constructor with an early `return` (a
  // common guard-clause pattern, e.g. bailing out on FastBoot) must not
  // dead-code the `Object.defineProperty(..., { enumerable: false })` call.
  // The hide statement must run right after `super(...)`, before the
  // guard clause's `return`, not be appended at the end of the constructor
  // where it would become unreachable on that path.
  it('hides an undecorated private field even when the constructor has an early return', async () => {
    const code = `
import Service from '@ember/service';

class TestService extends Service {
  #plain = 'hidden';

  constructor(owner) {
    super(owner);
    if (owner.isFastBoot) {
      return;
    }
    this.setup();
  }

  setup() {}
}

export default TestService;
    `;

    const result = await babel.transformAsync(code, {
      filename: '/rewritten-app/app/services/test-service.js',
      babelrc: false,
      configFile: false,
      plugins: [plugin],
    });

    expect(result.code).toMatch(
      /super\(owner\);\s*Object\.defineProperty\(this, ["'](_?\w*hmrPrivPlain)["'], \{\s*value: this\.\1,\s*writable: true,\s*configurable: true,\s*enumerable: false\s*\}\);\s*if \(owner\.isFastBoot\)/,
    );
  });

  // Regression test: when `super(...)` isn't a single top-level statement
  // of the constructor body (e.g. it's called conditionally in each branch
  // of an `if`), there's no single safe point right after "the" super call
  // to insert into -- inserting at the very top of the constructor in this
  // case would read/write `this` before `super()` has unconditionally run,
  // which throws. The hide call must fall back to appending at the end
  // instead of crashing.
  it('falls back to appending at the end when super() is not a top-level constructor statement', async () => {
    const code = `
import Service from '@ember/service';

class TestService extends Service {
  #plain = 'hidden';

  constructor(owner) {
    if (owner) {
      super(owner);
    } else {
      super();
    }
  }
}

export default TestService;
    `;

    const result = await babel.transformAsync(code, {
      filename: '/rewritten-app/app/services/test-service.js',
      babelrc: false,
      configFile: false,
      plugins: [plugin],
    });

    expect(result.code).toMatch(
      /constructor\(owner\)\s*\{\s*if \(owner\)\s*\{\s*super\(owner\);\s*\}\s*else\s*\{\s*super\(\);\s*\}\s*Object\.defineProperty\(this, ["'](_?\w*hmrPrivPlain)["'], \{\s*value: this\.\1,\s*writable: true,\s*configurable: true,\s*enumerable: false\s*\}\);\s*\}/,
    );
  });

  // Regression test: a base class (no `extends`) with its own constructor
  // has no `super()` call to anchor on, so the hide statements must go at
  // the very top of the constructor body instead.
  it('inserts at the top of an existing constructor for a base class with no superclass', async () => {
    const code = `
class TestBase {
  #plain = 'hidden';

  constructor() {
    this.setup();
  }

  setup() {}
}

export default TestBase;
    `;

    const result = await babel.transformAsync(code, {
      filename: '/rewritten-app/app/services/test-service.js',
      babelrc: false,
      configFile: false,
      plugins: [plugin],
    });

    expect(result.code).toMatch(
      /constructor\(\)\s*\{\s*Object\.defineProperty\(this, ["'](_?\w*hmrPrivPlain)["'], \{\s*value: this\.\1,\s*writable: true,\s*configurable: true,\s*enumerable: false\s*\}\);\s*this\.setup\(\);/,
    );
  });

  // Private names are lexically scoped to their *enclosing* class body, not
  // to the file, so code can legally reference an outer class's private
  // field from inside a nested class/closure via a captured `this` (e.g. a
  // factory method building and returning a class). An earlier version of
  // the rewrite blanket-skipped traversal into any nested class to avoid
  // renaming its own (unrelated) private members, which also stopped it
  // from rewriting a reference like this one -- renaming the declaration but
  // leaving the reference as a native `#secret` PrivateName, producing
  // invalid output ("Private field must be declared in an enclosing class").
  // Both sides must agree. `Inner` itself declares no private members of its
  // own, so it's untouched beyond that one reference.
  it('rewrites a private-field reference captured by a nested class the same way as its declaration', async () => {
    const code = `
import Service from '@ember/service';

class TestService extends Service {
  #secret = 'hidden';

  makeInner() {
    const self = this;
    return class Inner {
      read() {
        return self.#secret;
      }
    };
  }
}

export default TestService;
    `;

    const result = await babel.transformAsync(code, {
      filename: '/rewritten-app/app/services/test-service.js',
      babelrc: false,
      configFile: false,
      plugins: [plugin],
    });

    expect(result.code).toContain('hmrPrivSecret');
    expect(result.code).not.toContain('self.#secret');
    expect(result.code).toMatch(/self\.\w*hmrPrivSecret/);
  });

  // The `Class` visitor now runs on *every* class the file defines,
  // including one nested inside a factory method, so a nested class that
  // declares its *own* private field under the same name as the outer
  // class's gets its own independent rewrite -- a distinct generated name,
  // since the two are unrelated declarations that merely share a name
  // (private names resolve to the nearest enclosing class that declares
  // them, so this was always legitimate shadowing, never the same binding).
  it('renames a nested class shadowing the same private name to its own distinct property', async () => {
    const code = `
import Service from '@ember/service';

class TestService extends Service {
  #secret = 'outer';

  makeInner() {
    return class Inner {
      #secret = 'inner';
      read() {
        return this.#secret;
      }
    };
  }
}

export default TestService;
    `;

    const result = await babel.transformAsync(code, {
      filename: '/rewritten-app/app/services/test-service.js',
      babelrc: false,
      configFile: false,
      plugins: [plugin],
    });

    expect(result.code).not.toContain('#secret');

    const outerMatch = result.code.match(/(_?\w*hmrPrivSecret\w*) = 'outer'/);
    const innerMatch = result.code.match(/(_?\w*hmrPrivSecret\w*) = 'inner'/);
    expect(outerMatch).toBeTruthy();
    expect(innerMatch).toBeTruthy();

    // Distinct generated names -- not the same renamed property.
    expect(outerMatch[1]).not.toEqual(innerMatch[1]);
    expect(result.code).toContain(`this.${innerMatch[1]}`);
  });
});
