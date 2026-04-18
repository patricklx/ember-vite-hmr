import babel from '@babel/core';
import { describe, expect, it } from 'vitest';
import plugin from '../lib/babel-plugin.ts';

process.env['EMBER_VITE_HMR_ENABLED'] = 'true';

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
    expect(result.code).toContain('let _TestServiceImpl');
    expect(result.code).toContain('let _TestServiceProxy');
    expect(result.code).toContain('import.meta.hot');
    expect(result.code).toContain('_hotReload');
    expect(result.code).toContain('new Proxy');
    expect(result.code).toContain('static Impl');
    expect(result.code).toContain('_delegate');
    expect(result.code).toContain('willDestroy');

    expect(result.code).toMatchInlineSnapshot(`
      "let _init_counter, _init_message, _init__delegate;
      function applyDecs2203RFactory() { function createAddInitializerMethod(e, t) { return function (r) { !function (e) { if (e.v) throw Error("attempted to call addInitializer after decoration was finished"); }(t), assertCallable(r, "An initializer"), e.push(r); }; } function memberDec(e, t, r, n, a, i, o, s) { var c; switch (a) { case 1: c = "accessor"; break; case 2: c = "method"; break; case 3: c = "getter"; break; case 4: c = "setter"; break; default: c = "field"; } var l, u, f = { kind: c, name: o ? "#" + t : _toPropertyKey(t), static: i, private: o }, p = { v: !1 }; 0 !== a && (f.addInitializer = createAddInitializerMethod(n, p)), 0 === a ? o ? (l = r.get, u = r.set) : (l = function () { return this[t]; }, u = function (e) { this[t] = e; }) : 2 === a ? l = function () { return r.value; } : (1 !== a && 3 !== a || (l = function () { return r.get.call(this); }), 1 !== a && 4 !== a || (u = function (e) { r.set.call(this, e); })), f.access = l && u ? { get: l, set: u } : l ? { get: l } : { set: u }; try { return e(s, f); } finally { p.v = !0; } } function assertCallable(e, t) { if ("function" != typeof e) throw new TypeError(t + " must be a function"); } function assertValidReturnValue(e, t) { var r = typeof t; if (1 === e) { if ("object" !== r || null === t) throw new TypeError("accessor decorators must return an object with get, set, or init properties or void 0"); void 0 !== t.get && assertCallable(t.get, "accessor.get"), void 0 !== t.set && assertCallable(t.set, "accessor.set"), void 0 !== t.init && assertCallable(t.init, "accessor.init"); } else if ("function" !== r) throw new TypeError((0 === e ? "field" : 10 === e ? "class" : "method") + " decorators must return a function or void 0"); } function applyMemberDec(e, t, r, n, a, i, o, s) { var c, l, u, f, p, d, h, v = r[0]; if (o ? (0 === a || 1 === a ? (c = { get: r[3], set: r[4] }, u = "get") : 3 === a ? (c = { get: r[3] }, u = "get") : 4 === a ? (c = { set: r[3] }, u = "set") : c = { value: r[3] }, 0 !== a && (1 === a && _setFunctionName(r[4], "#" + n, "set"), _setFunctionName(r[3], "#" + n, u))) : 0 !== a && (c = Object.getOwnPropertyDescriptor(t, n)), 1 === a ? f = { get: c.get, set: c.set } : 2 === a ? f = c.value : 3 === a ? f = c.get : 4 === a && (f = c.set), "function" == typeof v) void 0 !== (p = memberDec(v, n, c, s, a, i, o, f)) && (assertValidReturnValue(a, p), 0 === a ? l = p : 1 === a ? (l = p.init, d = p.get || f.get, h = p.set || f.set, f = { get: d, set: h }) : f = p);else for (var g = v.length - 1; g >= 0; g--) { var y; void 0 !== (p = memberDec(v[g], n, c, s, a, i, o, f)) && (assertValidReturnValue(a, p), 0 === a ? y = p : 1 === a ? (y = p.init, d = p.get || f.get, h = p.set || f.set, f = { get: d, set: h }) : f = p, void 0 !== y && (void 0 === l ? l = y : "function" == typeof l ? l = [l, y] : l.push(y))); } if (0 === a || 1 === a) { if (void 0 === l) l = function (e, t) { return t; };else if ("function" != typeof l) { var m = l; l = function (e, t) { for (var r = t, n = 0; n < m.length; n++) r = m[n].call(e, r); return r; }; } else { var b = l; l = function (e, t) { return b.call(e, t); }; } e.push(l); } 0 !== a && (1 === a ? (c.get = f.get, c.set = f.set) : 2 === a ? c.value = f : 3 === a ? c.get = f : 4 === a && (c.set = f), o ? 1 === a ? (e.push(function (e, t) { return f.get.call(e, t); }), e.push(function (e, t) { return f.set.call(e, t); })) : 2 === a ? e.push(f) : e.push(function (e, t) { return f.call(e, t); }) : Object.defineProperty(t, n, c)); } function applyMemberDecs(e, t) { for (var r, n, a = [], i = new Map(), o = new Map(), s = 0; s < t.length; s++) { var c = t[s]; if (Array.isArray(c)) { var l, u, f = c[1], p = c[2], d = c.length > 3, h = f >= 5; if (h ? (l = e, 0 != (f -= 5) && (u = n = n || [])) : (l = e.prototype, 0 !== f && (u = r = r || [])), 0 !== f && !d) { var v = h ? o : i, g = v.get(p) || 0; if (!0 === g || 3 === g && 4 !== f || 4 === g && 3 !== f) throw Error("Attempted to decorate a public method/accessor that has the same name as a previously decorated public method/accessor. This is not currently supported by the decorators plugin. Property name was: " + p); !g && f > 2 ? v.set(p, f) : v.set(p, !0); } applyMemberDec(a, l, c, p, f, h, d, u); } } return pushInitializers(a, r), pushInitializers(a, n), a; } function pushInitializers(e, t) { t && e.push(function (e) { for (var r = 0; r < t.length; r++) t[r].call(e); return e; }); } return function (e, t, r) { return { e: applyMemberDecs(e, t), get c() { return function (e, t) { if (t.length > 0) { for (var r = [], n = e, a = e.name, i = t.length - 1; i >= 0; i--) { var o = { v: !1 }; try { var s = t[i](n, { kind: "class", name: a, addInitializer: createAddInitializerMethod(r, o) }); } finally { o.v = !0; } void 0 !== s && (assertValidReturnValue(10, s), n = s); } return [n, function () { for (var e = 0; e < r.length; e++) r[e].call(n); }]; } }(e, r); } }; }; }
      function _applyDecs2203R(e, t, r) { return (_applyDecs2203R = applyDecs2203RFactory())(e, t, r); }
      function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
      function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
      function _setFunctionName(e, t, n) { "symbol" == typeof t && (t = (t = t.description) ? "[" + t + "]" : ""); try { Object.defineProperty(e, "name", { configurable: !0, value: n ? n + " " + t : t }); } catch (e) {} return e; }
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
      let _TestServiceImpl = TestService;
      let _TestServiceProxy = null;
      export default class TestServiceHmrProxy extends Service {
        static {
          [_init__delegate] = _applyDecs2203R(this, [[tracked, 0, "_delegate"]], []).e;
        }
        static Impl = TestService;
        _delegate = _init__delegate(this, new _TestServiceImpl());
        constructor(...args) {
          super(...args);
          if (!_TestServiceProxy) {
            _TestServiceProxy = this;
          }
          return new Proxy(this, {
            get(target, prop) {
              if (prop === "_delegate") return target._delegate;
              return target._delegate[prop];
            },
            set(target, prop, value) {
              target._delegate[prop] = value;
              return true;
            }
          });
        }
        willDestroy() {
          super.willDestroy();
          this._delegate.willDestroy();
        }
      }
      if (import.meta.hot) {
        import.meta.hot.accept(newModule => {
          if (import.meta.hot.data._hotReload && newModule?.default?.Impl) {
            import.meta.hot.data._hotReload(newModule.default.Impl);
          }
        });
        import.meta.hot.data._hotReload = import.meta.hot.data._hotReload || function (NewImpl) {
          if (!_TestServiceProxy) {
            _TestServiceImpl = NewImpl;
            return;
          }
          const oldDelegate = _TestServiceProxy._delegate;
          _TestServiceImpl = NewImpl;
          const newDelegate = new _TestServiceImpl();
          _TestServiceProxy._delegate = newDelegate;
          for (const key in oldDelegate) {
            const descriptor = Object.getOwnPropertyDescriptor(oldDelegate, key) || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(oldDelegate), key);
            const hasOwnDefault = Object.prototype.hasOwnProperty.call(newDelegate, key);
            const currentValue = newDelegate[key];
            const previousValue = oldDelegate[key];
            if (previousValue instanceof Service) {
              continue;
            }
            if (typeof previousValue === 'function') {
              continue;
            }
            const shouldSync = !!descriptor && (descriptor.writable || descriptor.set || Object.prototype.hasOwnProperty.call(oldDelegate, key)) && (!hasOwnDefault || currentValue === previousValue);
            if (shouldSync) {
              try {
                newDelegate[key] = previousValue;
              } catch (e) {}
            }
          }
          if (oldDelegate.willDestroy) {
            oldDelegate.willDestroy();
          }
        };
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
    expect(result.code).toContain('let _SimpleServiceImpl');
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

    expect(result.code).toMatchInlineSnapshot(`
      "let _initClass, _init_data, _init__delegate;
      function applyDecs2203RFactory() { function createAddInitializerMethod(e, t) { return function (r) { !function (e) { if (e.v) throw Error("attempted to call addInitializer after decoration was finished"); }(t), assertCallable(r, "An initializer"), e.push(r); }; } function memberDec(e, t, r, n, a, i, o, s) { var c; switch (a) { case 1: c = "accessor"; break; case 2: c = "method"; break; case 3: c = "getter"; break; case 4: c = "setter"; break; default: c = "field"; } var l, u, f = { kind: c, name: o ? "#" + t : _toPropertyKey(t), static: i, private: o }, p = { v: !1 }; 0 !== a && (f.addInitializer = createAddInitializerMethod(n, p)), 0 === a ? o ? (l = r.get, u = r.set) : (l = function () { return this[t]; }, u = function (e) { this[t] = e; }) : 2 === a ? l = function () { return r.value; } : (1 !== a && 3 !== a || (l = function () { return r.get.call(this); }), 1 !== a && 4 !== a || (u = function (e) { r.set.call(this, e); })), f.access = l && u ? { get: l, set: u } : l ? { get: l } : { set: u }; try { return e(s, f); } finally { p.v = !0; } } function assertCallable(e, t) { if ("function" != typeof e) throw new TypeError(t + " must be a function"); } function assertValidReturnValue(e, t) { var r = typeof t; if (1 === e) { if ("object" !== r || null === t) throw new TypeError("accessor decorators must return an object with get, set, or init properties or void 0"); void 0 !== t.get && assertCallable(t.get, "accessor.get"), void 0 !== t.set && assertCallable(t.set, "accessor.set"), void 0 !== t.init && assertCallable(t.init, "accessor.init"); } else if ("function" !== r) throw new TypeError((0 === e ? "field" : 10 === e ? "class" : "method") + " decorators must return a function or void 0"); } function applyMemberDec(e, t, r, n, a, i, o, s) { var c, l, u, f, p, d, h, v = r[0]; if (o ? (0 === a || 1 === a ? (c = { get: r[3], set: r[4] }, u = "get") : 3 === a ? (c = { get: r[3] }, u = "get") : 4 === a ? (c = { set: r[3] }, u = "set") : c = { value: r[3] }, 0 !== a && (1 === a && _setFunctionName(r[4], "#" + n, "set"), _setFunctionName(r[3], "#" + n, u))) : 0 !== a && (c = Object.getOwnPropertyDescriptor(t, n)), 1 === a ? f = { get: c.get, set: c.set } : 2 === a ? f = c.value : 3 === a ? f = c.get : 4 === a && (f = c.set), "function" == typeof v) void 0 !== (p = memberDec(v, n, c, s, a, i, o, f)) && (assertValidReturnValue(a, p), 0 === a ? l = p : 1 === a ? (l = p.init, d = p.get || f.get, h = p.set || f.set, f = { get: d, set: h }) : f = p);else for (var g = v.length - 1; g >= 0; g--) { var y; void 0 !== (p = memberDec(v[g], n, c, s, a, i, o, f)) && (assertValidReturnValue(a, p), 0 === a ? y = p : 1 === a ? (y = p.init, d = p.get || f.get, h = p.set || f.set, f = { get: d, set: h }) : f = p, void 0 !== y && (void 0 === l ? l = y : "function" == typeof l ? l = [l, y] : l.push(y))); } if (0 === a || 1 === a) { if (void 0 === l) l = function (e, t) { return t; };else if ("function" != typeof l) { var m = l; l = function (e, t) { for (var r = t, n = 0; n < m.length; n++) r = m[n].call(e, r); return r; }; } else { var b = l; l = function (e, t) { return b.call(e, t); }; } e.push(l); } 0 !== a && (1 === a ? (c.get = f.get, c.set = f.set) : 2 === a ? c.value = f : 3 === a ? c.get = f : 4 === a && (c.set = f), o ? 1 === a ? (e.push(function (e, t) { return f.get.call(e, t); }), e.push(function (e, t) { return f.set.call(e, t); })) : 2 === a ? e.push(f) : e.push(function (e, t) { return f.call(e, t); }) : Object.defineProperty(t, n, c)); } function applyMemberDecs(e, t) { for (var r, n, a = [], i = new Map(), o = new Map(), s = 0; s < t.length; s++) { var c = t[s]; if (Array.isArray(c)) { var l, u, f = c[1], p = c[2], d = c.length > 3, h = f >= 5; if (h ? (l = e, 0 != (f -= 5) && (u = n = n || [])) : (l = e.prototype, 0 !== f && (u = r = r || [])), 0 !== f && !d) { var v = h ? o : i, g = v.get(p) || 0; if (!0 === g || 3 === g && 4 !== f || 4 === g && 3 !== f) throw Error("Attempted to decorate a public method/accessor that has the same name as a previously decorated public method/accessor. This is not currently supported by the decorators plugin. Property name was: " + p); !g && f > 2 ? v.set(p, f) : v.set(p, !0); } applyMemberDec(a, l, c, p, f, h, d, u); } } return pushInitializers(a, r), pushInitializers(a, n), a; } function pushInitializers(e, t) { t && e.push(function (e) { for (var r = 0; r < t.length; r++) t[r].call(e); return e; }); } return function (e, t, r) { return { e: applyMemberDecs(e, t), get c() { return function (e, t) { if (t.length > 0) { for (var r = [], n = e, a = e.name, i = t.length - 1; i >= 0; i--) { var o = { v: !1 }; try { var s = t[i](n, { kind: "class", name: a, addInitializer: createAddInitializerMethod(r, o) }); } finally { o.v = !0; } void 0 !== s && (assertValidReturnValue(10, s), n = s); } return [n, function () { for (var e = 0; e < r.length; e++) r[e].call(n); }]; } }(e, r); } }; }; }
      function _applyDecs2203R(e, t, r) { return (_applyDecs2203R = applyDecs2203RFactory())(e, t, r); }
      function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
      function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
      function _setFunctionName(e, t, n) { "symbol" == typeof t && (t = (t = t.description) ? "[" + t + "]" : ""); try { Object.defineProperty(e, "name", { configurable: !0, value: n ? n + " " + t : t }); } catch (e) {} return e; }
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
      let _DataServiceImpl = _DataService;
      let _DataServiceProxy = null;
      export default class DataServiceHmrProxy extends Service {
        static {
          [_init__delegate] = _applyDecs2203R(this, [[tracked, 0, "_delegate"]], []).e;
        }
        static Impl = _DataService;
        _delegate = _init__delegate(this, new _DataServiceImpl());
        constructor(...args) {
          super(...args);
          if (!_DataServiceProxy) {
            _DataServiceProxy = this;
          }
          return new Proxy(this, {
            get(target, prop) {
              if (prop === "_delegate") return target._delegate;
              return target._delegate[prop];
            },
            set(target, prop, value) {
              target._delegate[prop] = value;
              return true;
            }
          });
        }
        willDestroy() {
          super.willDestroy();
          this._delegate.willDestroy();
        }
      }
      if (import.meta.hot) {
        import.meta.hot.accept(newModule => {
          if (import.meta.hot.data._hotReload && newModule?.default?.Impl) {
            import.meta.hot.data._hotReload(newModule.default.Impl);
          }
        });
        import.meta.hot.data._hotReload = import.meta.hot.data._hotReload || function (NewImpl) {
          if (!_DataServiceProxy) {
            _DataServiceImpl = NewImpl;
            return;
          }
          const oldDelegate = _DataServiceProxy._delegate;
          _DataServiceImpl = NewImpl;
          const newDelegate = new _DataServiceImpl();
          _DataServiceProxy._delegate = newDelegate;
          for (const key in oldDelegate) {
            const descriptor = Object.getOwnPropertyDescriptor(oldDelegate, key) || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(oldDelegate), key);
            const hasOwnDefault = Object.prototype.hasOwnProperty.call(newDelegate, key);
            const currentValue = newDelegate[key];
            const previousValue = oldDelegate[key];
            if (previousValue instanceof Service) {
              continue;
            }
            if (typeof previousValue === 'function') {
              continue;
            }
            const shouldSync = !!descriptor && (descriptor.writable || descriptor.set || Object.prototype.hasOwnProperty.call(oldDelegate, key)) && (!hasOwnDefault || currentValue === previousValue);
            if (shouldSync) {
              try {
                newDelegate[key] = previousValue;
              } catch (e) {}
            }
          }
          if (oldDelegate.willDestroy) {
            oldDelegate.willDestroy();
          }
        };
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
    expect(result.code).toContain('let _TestServiceImpl');
    expect(result.code).toContain('let _TestServiceProxy');
    expect(result.code).toContain('import.meta.hot');
    expect(result.code).toContain('_hotReload');
    expect(result.code).toContain('new Proxy');
    expect(result.code).toContain('static Impl');
    expect(result.code).toContain('_delegate');
    expect(result.code).toContain('willDestroy');
  });
});
