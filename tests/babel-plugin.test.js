import babel from '@babel/core';
import { describe, expect, it } from 'vitest';
import { Preprocessor } from 'content-tag';
import plugin, { hotAstProcessor } from '../lib/babel-plugin';
import emberBabel from 'babel-plugin-ember-template-compilation';
import TemplateCompiler from 'ember-cli-htmlbars/lib/template-compiler-plugin';

process.env['EMBER_VITE_HMR_ENABLED'] = 'true';
const p = new Preprocessor();

describe('convert template with hot reload helpers', () => {
  it('should convert hbs correctly', () => {
    const code = `
      {{(myhelper)}}
      <this.X />
      {{component this.X}}
      <SomeComponent />
      <NamedComponent />
    `;
    const preTransformed = TemplateCompiler.prototype.processString(
      code,
      'a.hbs',
    );

    // this will be done by @embroider/compat when all static
    const imports = `
    `;

    function transform(env) {
      return {
        visitor: {
          Template(node, path) {
            env.meta.jsutils.bindImport(
              'embroider_compat/components/named-component',
              'default',
              null,
              { nameHint: 'NamedComponent' },
            );
            env.meta.jsutils.bindImport(
              'embroider_compat/components/some-component',
              'default',
              null,
              { nameHint: 'SomeComponent' },
            );
            env.meta.jsutils.bindImport(
              'embroider_compat/helpers/my-helper',
              'default',
              null,
              { nameHint: 'myhelper' },
            );
          },
        },
      };
    }

    const result = babel.transform(imports + preTransformed, {
      filename: '/rewritten-app/a.hbs',
      plugins: [
        plugin,
        ['@babel/plugin-proposal-decorators', { version: '2022-03' }],
        [
          emberBabel,
          {
            transforms: [transform, hotAstProcessor.transform],
            targetFormat: 'hbs',
            //compiler: require('ember-source/dist/ember-template-compiler'),
            enableLegacyModules: [
              'ember-cli-htmlbars',
              'ember-cli-htmlbars-inline-precompile',
              'htmlbars-inline-precompile',
            ],
          },
        ],
      ],
    });

    expect(result.code).toMatchInlineSnapshot(`
      "let _init_NamedComponent, _init_SomeComponent, _init_myhelper;
      function applyDecs2203RFactory() { function createAddInitializerMethod(e, t) { return function (r) { !function (e, t) { if (e.v) throw Error("attempted to call addInitializer after decoration was finished"); }(t), assertCallable(r, "An initializer"), e.push(r); }; } function memberDec(e, t, r, n, a, i, o, s) { var c; switch (a) { case 1: c = "accessor"; break; case 2: c = "method"; break; case 3: c = "getter"; break; case 4: c = "setter"; break; default: c = "field"; } var l, u, f = { kind: c, name: o ? "#" + t : _toPropertyKey(t), static: i, private: o }, p = { v: !1 }; 0 !== a && (f.addInitializer = createAddInitializerMethod(n, p)), 0 === a ? o ? (l = r.get, u = r.set) : (l = function () { return this[t]; }, u = function (e) { this[t] = e; }) : 2 === a ? l = function () { return r.value; } : (1 !== a && 3 !== a || (l = function () { return r.get.call(this); }), 1 !== a && 4 !== a || (u = function (e) { r.set.call(this, e); })), f.access = l && u ? { get: l, set: u } : l ? { get: l } : { set: u }; try { return e(s, f); } finally { p.v = !0; } } function assertCallable(e, t) { if ("function" != typeof e) throw new TypeError(t + " must be a function"); } function assertValidReturnValue(e, t) { var r = typeof t; if (1 === e) { if ("object" !== r || null === t) throw new TypeError("accessor decorators must return an object with get, set, or init properties or void 0"); void 0 !== t.get && assertCallable(t.get, "accessor.get"), void 0 !== t.set && assertCallable(t.set, "accessor.set"), void 0 !== t.init && assertCallable(t.init, "accessor.init"); } else if ("function" !== r) throw new TypeError((0 === e ? "field" : 10 === e ? "class" : "method") + " decorators must return a function or void 0"); } function applyMemberDec(e, t, r, n, a, i, o, s) { var c, l, u, f, p, d, h, v = r[0]; if (o ? (0 === a || 1 === a ? (c = { get: r[3], set: r[4] }, u = "get") : 3 === a ? (c = { get: r[3] }, u = "get") : 4 === a ? (c = { set: r[3] }, u = "set") : c = { value: r[3] }, 0 !== a && (1 === a && _setFunctionName(r[4], "#" + n, "set"), _setFunctionName(r[3], "#" + n, u))) : 0 !== a && (c = Object.getOwnPropertyDescriptor(t, n)), 1 === a ? f = { get: c.get, set: c.set } : 2 === a ? f = c.value : 3 === a ? f = c.get : 4 === a && (f = c.set), "function" == typeof v) void 0 !== (p = memberDec(v, n, c, s, a, i, o, f)) && (assertValidReturnValue(a, p), 0 === a ? l = p : 1 === a ? (l = p.init, d = p.get || f.get, h = p.set || f.set, f = { get: d, set: h }) : f = p);else for (var g = v.length - 1; g >= 0; g--) { var y; void 0 !== (p = memberDec(v[g], n, c, s, a, i, o, f)) && (assertValidReturnValue(a, p), 0 === a ? y = p : 1 === a ? (y = p.init, d = p.get || f.get, h = p.set || f.set, f = { get: d, set: h }) : f = p, void 0 !== y && (void 0 === l ? l = y : "function" == typeof l ? l = [l, y] : l.push(y))); } if (0 === a || 1 === a) { if (void 0 === l) l = function (e, t) { return t; };else if ("function" != typeof l) { var m = l; l = function (e, t) { for (var r = t, n = 0; n < m.length; n++) r = m[n].call(e, r); return r; }; } else { var b = l; l = function (e, t) { return b.call(e, t); }; } e.push(l); } 0 !== a && (1 === a ? (c.get = f.get, c.set = f.set) : 2 === a ? c.value = f : 3 === a ? c.get = f : 4 === a && (c.set = f), o ? 1 === a ? (e.push(function (e, t) { return f.get.call(e, t); }), e.push(function (e, t) { return f.set.call(e, t); })) : 2 === a ? e.push(f) : e.push(function (e, t) { return f.call(e, t); }) : Object.defineProperty(t, n, c)); } function applyMemberDecs(e, t) { for (var r, n, a = [], i = new Map(), o = new Map(), s = 0; s < t.length; s++) { var c = t[s]; if (Array.isArray(c)) { var l, u, f = c[1], p = c[2], d = c.length > 3, h = f >= 5; if (h ? (l = e, 0 != (f -= 5) && (u = n = n || [])) : (l = e.prototype, 0 !== f && (u = r = r || [])), 0 !== f && !d) { var v = h ? o : i, g = v.get(p) || 0; if (!0 === g || 3 === g && 4 !== f || 4 === g && 3 !== f) throw Error("Attempted to decorate a public method/accessor that has the same name as a previously decorated public method/accessor. This is not currently supported by the decorators plugin. Property name was: " + p); !g && f > 2 ? v.set(p, f) : v.set(p, !0); } applyMemberDec(a, l, c, p, f, h, d, u); } } return pushInitializers(a, r), pushInitializers(a, n), a; } function pushInitializers(e, t) { t && e.push(function (e) { for (var r = 0; r < t.length; r++) t[r].call(e); return e; }); } return function (e, t, r) { return { e: applyMemberDecs(e, t), get c() { return function (e, t) { if (t.length > 0) { for (var r = [], n = e, a = e.name, i = t.length - 1; i >= 0; i--) { var o = { v: !1 }; try { var s = t[i](n, { kind: "class", name: a, addInitializer: createAddInitializerMethod(r, o) }); } finally { o.v = !0; } void 0 !== s && (assertValidReturnValue(10, s), n = s); } return [n, function () { for (var e = 0; e < r.length; e++) r[e].call(n); }]; } }(e, r); } }; }; }
      function _applyDecs2203R(e, t, r) { return (_applyDecs2203R = applyDecs2203RFactory())(e, t, r); }
      function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
      function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
      function _setFunctionName(e, t, n) { "symbol" == typeof t && (t = (t = t.description) ? "[" + t + "]" : ""); try { Object.defineProperty(e, "name", { configurable: !0, value: n ? n + " " + t : t }); } catch (e) {} return e; }
      let template__imports__ = null;
      import NamedComponent from "embroider_compat/components/named-component";
      import SomeComponent from "embroider_compat/components/some-component";
      import myhelper from "embroider_compat/helpers/my-helper";
      import { precompileTemplate } from "@ember/template-compilation";
      import { tracked } from "@glimmer/tracking";
      import _ref0 from "@glimmer/component";
      template__imports__ = new class _Imports {
        static {
          [_init_NamedComponent, _init_SomeComponent, _init_myhelper] = _applyDecs2203R(this, [[tracked, 0, "NamedComponent"], [tracked, 0, "SomeComponent"], [tracked, 0, "myhelper"]], []).e;
        }
        NamedComponent = _init_NamedComponent(this, NamedComponent);
        SomeComponent = _init_SomeComponent(this, SomeComponent);
        myhelper = _init_myhelper(this, myhelper);
      }()
      export default precompileTemplate("\\n      {{(template__imports__.myhelper)}}\\n      <this.X />\\n      {{component this.X}}\\n      <template__imports__.SomeComponent />\\n      <template__imports__.NamedComponent />\\n    ", {
        moduleName: 'a.hbs',
        scope: () => ({
          template__imports__
        })
      });
      if (import.meta.hot) {
        if (NamedComponent.prototype instanceof _ref0) {
          (async () => {
            const c = await import('ember-vite-hmr/virtual/component:embroider_compat/components/named-component:default.gjs');
            template__imports__.NamedComponent = c.default;
          })();
          import.meta.hot.accept('embroider_compat/components/named-component');
        }
        if (SomeComponent.prototype instanceof _ref0) {
          (async () => {
            const c = await import('ember-vite-hmr/virtual/component:embroider_compat/components/some-component:default.gjs');
            template__imports__.SomeComponent = c.default;
          })();
          import.meta.hot.accept('embroider_compat/components/some-component');
        }
        if (myhelper.prototype instanceof _ref0) {
          (async () => {
            const c = await import('ember-vite-hmr/virtual/component:embroider_compat/helpers/my-helper:default.gjs');
            template__imports__.myhelper = c.default;
          })();
          import.meta.hot.accept('embroider_compat/helpers/my-helper');
        }
      }"
    `);

    const resultWired = babel.transform(imports + preTransformed, {
      filename: '/rewritten-app/a.hbs',
      plugins: [
        plugin,
        ['@babel/plugin-proposal-decorators', { version: '2022-03' }],
        [
          emberBabel,
          {
            transforms: [transform, hotAstProcessor.transform],
            //targetFormat: 'hbs',
            compiler: require('ember-source/dist/ember-template-compiler'),
            enableLegacyModules: [
              'ember-cli-htmlbars',
              'ember-cli-htmlbars-inline-precompile',
              'htmlbars-inline-precompile',
            ],
          },
        ],
      ],
    });

    const resultCode = resultWired.code.replace(
      /"id": ".*",\n.*"block":/,
      '"id": "--id--",\n  "block":',
    );

    expect(resultCode).toMatchInlineSnapshot(`
      "let _init_NamedComponent, _init_SomeComponent, _init_myhelper;
      function applyDecs2203RFactory() { function createAddInitializerMethod(e, t) { return function (r) { !function (e, t) { if (e.v) throw Error("attempted to call addInitializer after decoration was finished"); }(t), assertCallable(r, "An initializer"), e.push(r); }; } function memberDec(e, t, r, n, a, i, o, s) { var c; switch (a) { case 1: c = "accessor"; break; case 2: c = "method"; break; case 3: c = "getter"; break; case 4: c = "setter"; break; default: c = "field"; } var l, u, f = { kind: c, name: o ? "#" + t : _toPropertyKey(t), static: i, private: o }, p = { v: !1 }; 0 !== a && (f.addInitializer = createAddInitializerMethod(n, p)), 0 === a ? o ? (l = r.get, u = r.set) : (l = function () { return this[t]; }, u = function (e) { this[t] = e; }) : 2 === a ? l = function () { return r.value; } : (1 !== a && 3 !== a || (l = function () { return r.get.call(this); }), 1 !== a && 4 !== a || (u = function (e) { r.set.call(this, e); })), f.access = l && u ? { get: l, set: u } : l ? { get: l } : { set: u }; try { return e(s, f); } finally { p.v = !0; } } function assertCallable(e, t) { if ("function" != typeof e) throw new TypeError(t + " must be a function"); } function assertValidReturnValue(e, t) { var r = typeof t; if (1 === e) { if ("object" !== r || null === t) throw new TypeError("accessor decorators must return an object with get, set, or init properties or void 0"); void 0 !== t.get && assertCallable(t.get, "accessor.get"), void 0 !== t.set && assertCallable(t.set, "accessor.set"), void 0 !== t.init && assertCallable(t.init, "accessor.init"); } else if ("function" !== r) throw new TypeError((0 === e ? "field" : 10 === e ? "class" : "method") + " decorators must return a function or void 0"); } function applyMemberDec(e, t, r, n, a, i, o, s) { var c, l, u, f, p, d, h, v = r[0]; if (o ? (0 === a || 1 === a ? (c = { get: r[3], set: r[4] }, u = "get") : 3 === a ? (c = { get: r[3] }, u = "get") : 4 === a ? (c = { set: r[3] }, u = "set") : c = { value: r[3] }, 0 !== a && (1 === a && _setFunctionName(r[4], "#" + n, "set"), _setFunctionName(r[3], "#" + n, u))) : 0 !== a && (c = Object.getOwnPropertyDescriptor(t, n)), 1 === a ? f = { get: c.get, set: c.set } : 2 === a ? f = c.value : 3 === a ? f = c.get : 4 === a && (f = c.set), "function" == typeof v) void 0 !== (p = memberDec(v, n, c, s, a, i, o, f)) && (assertValidReturnValue(a, p), 0 === a ? l = p : 1 === a ? (l = p.init, d = p.get || f.get, h = p.set || f.set, f = { get: d, set: h }) : f = p);else for (var g = v.length - 1; g >= 0; g--) { var y; void 0 !== (p = memberDec(v[g], n, c, s, a, i, o, f)) && (assertValidReturnValue(a, p), 0 === a ? y = p : 1 === a ? (y = p.init, d = p.get || f.get, h = p.set || f.set, f = { get: d, set: h }) : f = p, void 0 !== y && (void 0 === l ? l = y : "function" == typeof l ? l = [l, y] : l.push(y))); } if (0 === a || 1 === a) { if (void 0 === l) l = function (e, t) { return t; };else if ("function" != typeof l) { var m = l; l = function (e, t) { for (var r = t, n = 0; n < m.length; n++) r = m[n].call(e, r); return r; }; } else { var b = l; l = function (e, t) { return b.call(e, t); }; } e.push(l); } 0 !== a && (1 === a ? (c.get = f.get, c.set = f.set) : 2 === a ? c.value = f : 3 === a ? c.get = f : 4 === a && (c.set = f), o ? 1 === a ? (e.push(function (e, t) { return f.get.call(e, t); }), e.push(function (e, t) { return f.set.call(e, t); })) : 2 === a ? e.push(f) : e.push(function (e, t) { return f.call(e, t); }) : Object.defineProperty(t, n, c)); } function applyMemberDecs(e, t) { for (var r, n, a = [], i = new Map(), o = new Map(), s = 0; s < t.length; s++) { var c = t[s]; if (Array.isArray(c)) { var l, u, f = c[1], p = c[2], d = c.length > 3, h = f >= 5; if (h ? (l = e, 0 != (f -= 5) && (u = n = n || [])) : (l = e.prototype, 0 !== f && (u = r = r || [])), 0 !== f && !d) { var v = h ? o : i, g = v.get(p) || 0; if (!0 === g || 3 === g && 4 !== f || 4 === g && 3 !== f) throw Error("Attempted to decorate a public method/accessor that has the same name as a previously decorated public method/accessor. This is not currently supported by the decorators plugin. Property name was: " + p); !g && f > 2 ? v.set(p, f) : v.set(p, !0); } applyMemberDec(a, l, c, p, f, h, d, u); } } return pushInitializers(a, r), pushInitializers(a, n), a; } function pushInitializers(e, t) { t && e.push(function (e) { for (var r = 0; r < t.length; r++) t[r].call(e); return e; }); } return function (e, t, r) { return { e: applyMemberDecs(e, t), get c() { return function (e, t) { if (t.length > 0) { for (var r = [], n = e, a = e.name, i = t.length - 1; i >= 0; i--) { var o = { v: !1 }; try { var s = t[i](n, { kind: "class", name: a, addInitializer: createAddInitializerMethod(r, o) }); } finally { o.v = !0; } void 0 !== s && (assertValidReturnValue(10, s), n = s); } return [n, function () { for (var e = 0; e < r.length; e++) r[e].call(n); }]; } }(e, r); } }; }; }
      function _applyDecs2203R(e, t, r) { return (_applyDecs2203R = applyDecs2203RFactory())(e, t, r); }
      function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
      function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
      function _setFunctionName(e, t, n) { "symbol" == typeof t && (t = (t = t.description) ? "[" + t + "]" : ""); try { Object.defineProperty(e, "name", { configurable: !0, value: n ? n + " " + t : t }); } catch (e) {} return e; }
      let template__imports__ = null;
      import NamedComponent from "embroider_compat/components/named-component";
      import SomeComponent from "embroider_compat/components/some-component";
      import myhelper from "embroider_compat/helpers/my-helper";
      import { createTemplateFactory } from "@ember/template-factory";
      import { tracked } from "@glimmer/tracking";
      import _ref0 from "@glimmer/component";
      template__imports__ = new class _Imports {
        static {
          [_init_NamedComponent, _init_SomeComponent, _init_myhelper] = _applyDecs2203R(this, [[tracked, 0, "NamedComponent"], [tracked, 0, "SomeComponent"], [tracked, 0, "myhelper"]], []).e;
        }
        NamedComponent = _init_NamedComponent(this, NamedComponent);
        SomeComponent = _init_SomeComponent(this, SomeComponent);
        myhelper = _init_myhelper(this, myhelper);
      }()
      export default createTemplateFactory(
      /*
        
            {{(myhelper)}}
            <this.X />
            {{component this.X}}
            <SomeComponent />
            <NamedComponent />
          
      */
      {
        "id": "--id--",
        "block": "[[[1,\\"\\\\n      \\"],[1,[28,[32,0,[\\"myhelper\\"]],null,null]],[1,\\"\\\\n      \\"],[8,[30,0,[\\"X\\"]],null,null,null],[1,\\"\\\\n      \\"],[46,[30,0,[\\"X\\"]],null,null,null],[1,\\"\\\\n      \\"],[8,[32,0,[\\"SomeComponent\\"]],null,null,null],[1,\\"\\\\n      \\"],[8,[32,0,[\\"NamedComponent\\"]],null,null,null],[1,\\"\\\\n    \\"]],[],false,[\\"component\\"]]",
        "moduleName": "a.hbs",
        "scope": () => [template__imports__],
        "isStrictMode": false
      });
      if (import.meta.hot) {
        if (NamedComponent.prototype instanceof _ref0) {
          (async () => {
            const c = await import('ember-vite-hmr/virtual/component:embroider_compat/components/named-component:default.gjs');
            template__imports__.NamedComponent = c.default;
          })();
          import.meta.hot.accept('embroider_compat/components/named-component');
        }
        if (SomeComponent.prototype instanceof _ref0) {
          (async () => {
            const c = await import('ember-vite-hmr/virtual/component:embroider_compat/components/some-component:default.gjs');
            template__imports__.SomeComponent = c.default;
          })();
          import.meta.hot.accept('embroider_compat/components/some-component');
        }
        if (myhelper.prototype instanceof _ref0) {
          (async () => {
            const c = await import('ember-vite-hmr/virtual/component:embroider_compat/helpers/my-helper:default.gjs');
            template__imports__.myhelper = c.default;
          })();
          import.meta.hot.accept('embroider_compat/helpers/my-helper');
        }
      }"
    `);
  });

  it('should convert gts correctly', () => {
    const code = `
       import SomeComponent, { NamedComponent, Other } from 'my-components';
       import myhelper from 'my-helpers';
       
       const T = <template>
            <Other />
        </template>;        
        <template>
      {{(myhelper)}}
      {{component SomeComponent}}
      <SomeComponent />
      <NamedComponent />
    </template>
    
    `;
    const preTransformed = p.process(code);
    const result = babel.transform(preTransformed, {
      filename: '/rewritten-app/a.gts',
      plugins: [
        ['@babel/plugin-proposal-decorators', { version: '2022-03' }],
        plugin,
        [
          emberBabel,
          {
            transforms: [hotAstProcessor.transform],
            targetFormat: 'hbs',
          },
        ],
      ],
    });
    expect(result.code).toMatchInlineSnapshot(`
      "let _init_NamedComponent, _init_Other, _init_SomeComponent, _init_myhelper;
      function applyDecs2203RFactory() { function createAddInitializerMethod(e, t) { return function (r) { !function (e, t) { if (e.v) throw Error("attempted to call addInitializer after decoration was finished"); }(t), assertCallable(r, "An initializer"), e.push(r); }; } function memberDec(e, t, r, n, a, i, o, s) { var c; switch (a) { case 1: c = "accessor"; break; case 2: c = "method"; break; case 3: c = "getter"; break; case 4: c = "setter"; break; default: c = "field"; } var l, u, f = { kind: c, name: o ? "#" + t : _toPropertyKey(t), static: i, private: o }, p = { v: !1 }; 0 !== a && (f.addInitializer = createAddInitializerMethod(n, p)), 0 === a ? o ? (l = r.get, u = r.set) : (l = function () { return this[t]; }, u = function (e) { this[t] = e; }) : 2 === a ? l = function () { return r.value; } : (1 !== a && 3 !== a || (l = function () { return r.get.call(this); }), 1 !== a && 4 !== a || (u = function (e) { r.set.call(this, e); })), f.access = l && u ? { get: l, set: u } : l ? { get: l } : { set: u }; try { return e(s, f); } finally { p.v = !0; } } function assertCallable(e, t) { if ("function" != typeof e) throw new TypeError(t + " must be a function"); } function assertValidReturnValue(e, t) { var r = typeof t; if (1 === e) { if ("object" !== r || null === t) throw new TypeError("accessor decorators must return an object with get, set, or init properties or void 0"); void 0 !== t.get && assertCallable(t.get, "accessor.get"), void 0 !== t.set && assertCallable(t.set, "accessor.set"), void 0 !== t.init && assertCallable(t.init, "accessor.init"); } else if ("function" !== r) throw new TypeError((0 === e ? "field" : 10 === e ? "class" : "method") + " decorators must return a function or void 0"); } function applyMemberDec(e, t, r, n, a, i, o, s) { var c, l, u, f, p, d, h, v = r[0]; if (o ? (0 === a || 1 === a ? (c = { get: r[3], set: r[4] }, u = "get") : 3 === a ? (c = { get: r[3] }, u = "get") : 4 === a ? (c = { set: r[3] }, u = "set") : c = { value: r[3] }, 0 !== a && (1 === a && _setFunctionName(r[4], "#" + n, "set"), _setFunctionName(r[3], "#" + n, u))) : 0 !== a && (c = Object.getOwnPropertyDescriptor(t, n)), 1 === a ? f = { get: c.get, set: c.set } : 2 === a ? f = c.value : 3 === a ? f = c.get : 4 === a && (f = c.set), "function" == typeof v) void 0 !== (p = memberDec(v, n, c, s, a, i, o, f)) && (assertValidReturnValue(a, p), 0 === a ? l = p : 1 === a ? (l = p.init, d = p.get || f.get, h = p.set || f.set, f = { get: d, set: h }) : f = p);else for (var g = v.length - 1; g >= 0; g--) { var y; void 0 !== (p = memberDec(v[g], n, c, s, a, i, o, f)) && (assertValidReturnValue(a, p), 0 === a ? y = p : 1 === a ? (y = p.init, d = p.get || f.get, h = p.set || f.set, f = { get: d, set: h }) : f = p, void 0 !== y && (void 0 === l ? l = y : "function" == typeof l ? l = [l, y] : l.push(y))); } if (0 === a || 1 === a) { if (void 0 === l) l = function (e, t) { return t; };else if ("function" != typeof l) { var m = l; l = function (e, t) { for (var r = t, n = 0; n < m.length; n++) r = m[n].call(e, r); return r; }; } else { var b = l; l = function (e, t) { return b.call(e, t); }; } e.push(l); } 0 !== a && (1 === a ? (c.get = f.get, c.set = f.set) : 2 === a ? c.value = f : 3 === a ? c.get = f : 4 === a && (c.set = f), o ? 1 === a ? (e.push(function (e, t) { return f.get.call(e, t); }), e.push(function (e, t) { return f.set.call(e, t); })) : 2 === a ? e.push(f) : e.push(function (e, t) { return f.call(e, t); }) : Object.defineProperty(t, n, c)); } function applyMemberDecs(e, t) { for (var r, n, a = [], i = new Map(), o = new Map(), s = 0; s < t.length; s++) { var c = t[s]; if (Array.isArray(c)) { var l, u, f = c[1], p = c[2], d = c.length > 3, h = f >= 5; if (h ? (l = e, 0 != (f -= 5) && (u = n = n || [])) : (l = e.prototype, 0 !== f && (u = r = r || [])), 0 !== f && !d) { var v = h ? o : i, g = v.get(p) || 0; if (!0 === g || 3 === g && 4 !== f || 4 === g && 3 !== f) throw Error("Attempted to decorate a public method/accessor that has the same name as a previously decorated public method/accessor. This is not currently supported by the decorators plugin. Property name was: " + p); !g && f > 2 ? v.set(p, f) : v.set(p, !0); } applyMemberDec(a, l, c, p, f, h, d, u); } } return pushInitializers(a, r), pushInitializers(a, n), a; } function pushInitializers(e, t) { t && e.push(function (e) { for (var r = 0; r < t.length; r++) t[r].call(e); return e; }); } return function (e, t, r) { return { e: applyMemberDecs(e, t), get c() { return function (e, t) { if (t.length > 0) { for (var r = [], n = e, a = e.name, i = t.length - 1; i >= 0; i--) { var o = { v: !1 }; try { var s = t[i](n, { kind: "class", name: a, addInitializer: createAddInitializerMethod(r, o) }); } finally { o.v = !0; } void 0 !== s && (assertValidReturnValue(10, s), n = s); } return [n, function () { for (var e = 0; e < r.length; e++) r[e].call(n); }]; } }(e, r); } }; }; }
      function _applyDecs2203R(e, t, r) { return (_applyDecs2203R = applyDecs2203RFactory())(e, t, r); }
      function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
      function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
      function _setFunctionName(e, t, n) { "symbol" == typeof t && (t = (t = t.description) ? "[" + t + "]" : ""); try { Object.defineProperty(e, "name", { configurable: !0, value: n ? n + " " + t : t }); } catch (e) {} return e; }
      import SomeComponent, { NamedComponent, Other } from 'my-components';
      import myhelper from 'my-helpers';
      import { precompileTemplate } from "@ember/template-compilation";
      import { setComponentTemplate } from "@ember/component";
      import templateOnly from "@ember/component/template-only";
      import { tracked } from "@glimmer/tracking";
      import _ref0 from "@glimmer/component";
      let template__imports__ = null;
      template__imports__ = new class _Imports {
        static {
          [_init_NamedComponent, _init_Other, _init_SomeComponent, _init_myhelper] = _applyDecs2203R(this, [[tracked, 0, "NamedComponent"], [tracked, 0, "Other"], [tracked, 0, "SomeComponent"], [tracked, 0, "myhelper"]], []).e;
        }
        NamedComponent = _init_NamedComponent(this, NamedComponent);
        Other = _init_Other(this, Other);
        SomeComponent = _init_SomeComponent(this, SomeComponent);
        myhelper = _init_myhelper(this, myhelper);
      }()
      const T = setComponentTemplate(precompileTemplate("\\n            <template__imports__.Other />\\n        ", {
        strictMode: true,
        scope: () => ({
          template__imports__
        })
      }), templateOnly());
      export default setComponentTemplate(precompileTemplate("\\n      {{(template__imports__.myhelper)}}\\n      {{component template__imports__.SomeComponent}}\\n      <template__imports__.SomeComponent />\\n      <template__imports__.NamedComponent />\\n    ", {
        strictMode: true,
        scope: () => ({
          template__imports__
        })
      }), templateOnly());
      if (import.meta.hot) {
        if (NamedComponent.prototype instanceof _ref0) {
          (async () => {
            const c = await import('ember-vite-hmr/virtual/component:my-components:NamedComponent.gjs');
            template__imports__.NamedComponent = c.default;
          })();
          import.meta.hot.accept('my-components');
        }
        if (Other.prototype instanceof _ref0) {
          (async () => {
            const c = await import('ember-vite-hmr/virtual/component:my-components:Other.gjs');
            template__imports__.Other = c.default;
          })();
          import.meta.hot.accept('my-components');
        }
        if (SomeComponent.prototype instanceof _ref0) {
          (async () => {
            const c = await import('ember-vite-hmr/virtual/component:my-components:default.gjs');
            template__imports__.SomeComponent = c.default;
          })();
          import.meta.hot.accept('my-components');
        }
        if (myhelper.prototype instanceof _ref0) {
          (async () => {
            const c = await import('ember-vite-hmr/virtual/component:my-helpers:default.gjs');
            template__imports__.myhelper = c.default;
          })();
          import.meta.hot.accept('my-helpers');
        }
      }"
    `);

    const resultWired = babel.transform(preTransformed, {
      filename: '/rewritten-app/a.gts',
      plugins: [
        ['@babel/plugin-proposal-decorators', { version: '2022-03' }],
        plugin,
        [
          emberBabel,
          {
            transforms: [hotAstProcessor.transform],
            compiler: require('ember-source/dist/ember-template-compiler'),
          },
        ],
      ],
    });

    const resultCode = resultWired.code.replace(
      /"id": ".*",\n.*"block":/g,
      '"id": "--id--",\n  "block":',
    );

    expect(resultCode).toMatchInlineSnapshot(`
      "let _init_NamedComponent, _init_Other, _init_SomeComponent, _init_myhelper;
      function applyDecs2203RFactory() { function createAddInitializerMethod(e, t) { return function (r) { !function (e, t) { if (e.v) throw Error("attempted to call addInitializer after decoration was finished"); }(t), assertCallable(r, "An initializer"), e.push(r); }; } function memberDec(e, t, r, n, a, i, o, s) { var c; switch (a) { case 1: c = "accessor"; break; case 2: c = "method"; break; case 3: c = "getter"; break; case 4: c = "setter"; break; default: c = "field"; } var l, u, f = { kind: c, name: o ? "#" + t : _toPropertyKey(t), static: i, private: o }, p = { v: !1 }; 0 !== a && (f.addInitializer = createAddInitializerMethod(n, p)), 0 === a ? o ? (l = r.get, u = r.set) : (l = function () { return this[t]; }, u = function (e) { this[t] = e; }) : 2 === a ? l = function () { return r.value; } : (1 !== a && 3 !== a || (l = function () { return r.get.call(this); }), 1 !== a && 4 !== a || (u = function (e) { r.set.call(this, e); })), f.access = l && u ? { get: l, set: u } : l ? { get: l } : { set: u }; try { return e(s, f); } finally { p.v = !0; } } function assertCallable(e, t) { if ("function" != typeof e) throw new TypeError(t + " must be a function"); } function assertValidReturnValue(e, t) { var r = typeof t; if (1 === e) { if ("object" !== r || null === t) throw new TypeError("accessor decorators must return an object with get, set, or init properties or void 0"); void 0 !== t.get && assertCallable(t.get, "accessor.get"), void 0 !== t.set && assertCallable(t.set, "accessor.set"), void 0 !== t.init && assertCallable(t.init, "accessor.init"); } else if ("function" !== r) throw new TypeError((0 === e ? "field" : 10 === e ? "class" : "method") + " decorators must return a function or void 0"); } function applyMemberDec(e, t, r, n, a, i, o, s) { var c, l, u, f, p, d, h, v = r[0]; if (o ? (0 === a || 1 === a ? (c = { get: r[3], set: r[4] }, u = "get") : 3 === a ? (c = { get: r[3] }, u = "get") : 4 === a ? (c = { set: r[3] }, u = "set") : c = { value: r[3] }, 0 !== a && (1 === a && _setFunctionName(r[4], "#" + n, "set"), _setFunctionName(r[3], "#" + n, u))) : 0 !== a && (c = Object.getOwnPropertyDescriptor(t, n)), 1 === a ? f = { get: c.get, set: c.set } : 2 === a ? f = c.value : 3 === a ? f = c.get : 4 === a && (f = c.set), "function" == typeof v) void 0 !== (p = memberDec(v, n, c, s, a, i, o, f)) && (assertValidReturnValue(a, p), 0 === a ? l = p : 1 === a ? (l = p.init, d = p.get || f.get, h = p.set || f.set, f = { get: d, set: h }) : f = p);else for (var g = v.length - 1; g >= 0; g--) { var y; void 0 !== (p = memberDec(v[g], n, c, s, a, i, o, f)) && (assertValidReturnValue(a, p), 0 === a ? y = p : 1 === a ? (y = p.init, d = p.get || f.get, h = p.set || f.set, f = { get: d, set: h }) : f = p, void 0 !== y && (void 0 === l ? l = y : "function" == typeof l ? l = [l, y] : l.push(y))); } if (0 === a || 1 === a) { if (void 0 === l) l = function (e, t) { return t; };else if ("function" != typeof l) { var m = l; l = function (e, t) { for (var r = t, n = 0; n < m.length; n++) r = m[n].call(e, r); return r; }; } else { var b = l; l = function (e, t) { return b.call(e, t); }; } e.push(l); } 0 !== a && (1 === a ? (c.get = f.get, c.set = f.set) : 2 === a ? c.value = f : 3 === a ? c.get = f : 4 === a && (c.set = f), o ? 1 === a ? (e.push(function (e, t) { return f.get.call(e, t); }), e.push(function (e, t) { return f.set.call(e, t); })) : 2 === a ? e.push(f) : e.push(function (e, t) { return f.call(e, t); }) : Object.defineProperty(t, n, c)); } function applyMemberDecs(e, t) { for (var r, n, a = [], i = new Map(), o = new Map(), s = 0; s < t.length; s++) { var c = t[s]; if (Array.isArray(c)) { var l, u, f = c[1], p = c[2], d = c.length > 3, h = f >= 5; if (h ? (l = e, 0 != (f -= 5) && (u = n = n || [])) : (l = e.prototype, 0 !== f && (u = r = r || [])), 0 !== f && !d) { var v = h ? o : i, g = v.get(p) || 0; if (!0 === g || 3 === g && 4 !== f || 4 === g && 3 !== f) throw Error("Attempted to decorate a public method/accessor that has the same name as a previously decorated public method/accessor. This is not currently supported by the decorators plugin. Property name was: " + p); !g && f > 2 ? v.set(p, f) : v.set(p, !0); } applyMemberDec(a, l, c, p, f, h, d, u); } } return pushInitializers(a, r), pushInitializers(a, n), a; } function pushInitializers(e, t) { t && e.push(function (e) { for (var r = 0; r < t.length; r++) t[r].call(e); return e; }); } return function (e, t, r) { return { e: applyMemberDecs(e, t), get c() { return function (e, t) { if (t.length > 0) { for (var r = [], n = e, a = e.name, i = t.length - 1; i >= 0; i--) { var o = { v: !1 }; try { var s = t[i](n, { kind: "class", name: a, addInitializer: createAddInitializerMethod(r, o) }); } finally { o.v = !0; } void 0 !== s && (assertValidReturnValue(10, s), n = s); } return [n, function () { for (var e = 0; e < r.length; e++) r[e].call(n); }]; } }(e, r); } }; }; }
      function _applyDecs2203R(e, t, r) { return (_applyDecs2203R = applyDecs2203RFactory())(e, t, r); }
      function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
      function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
      function _setFunctionName(e, t, n) { "symbol" == typeof t && (t = (t = t.description) ? "[" + t + "]" : ""); try { Object.defineProperty(e, "name", { configurable: !0, value: n ? n + " " + t : t }); } catch (e) {} return e; }
      import SomeComponent, { NamedComponent, Other } from 'my-components';
      import myhelper from 'my-helpers';
      import { setComponentTemplate } from "@ember/component";
      import { createTemplateFactory } from "@ember/template-factory";
      import templateOnly from "@ember/component/template-only";
      import { tracked } from "@glimmer/tracking";
      import _ref0 from "@glimmer/component";
      let template__imports__ = null;
      template__imports__ = new class _Imports {
        static {
          [_init_NamedComponent, _init_Other, _init_SomeComponent, _init_myhelper] = _applyDecs2203R(this, [[tracked, 0, "NamedComponent"], [tracked, 0, "Other"], [tracked, 0, "SomeComponent"], [tracked, 0, "myhelper"]], []).e;
        }
        NamedComponent = _init_NamedComponent(this, NamedComponent);
        Other = _init_Other(this, Other);
        SomeComponent = _init_SomeComponent(this, SomeComponent);
        myhelper = _init_myhelper(this, myhelper);
      }()
      const T = setComponentTemplate(createTemplateFactory(
      /*
        
                  <Other />
              
      */
      {
        "id": "--id--",
        "block": "[[[1,\\"\\\\n            \\"],[8,[32,0,[\\"Other\\"]],null,null,null],[1,\\"\\\\n        \\"]],[],false,[]]",
        "moduleName": "/rewritten-app/a.gts",
        "scope": () => [template__imports__],
        "isStrictMode": true
      }), templateOnly());
      export default setComponentTemplate(createTemplateFactory(
      /*
        
            {{(myhelper)}}
            {{component SomeComponent}}
            <SomeComponent />
            <NamedComponent />
          
      */
      {
        "id": "--id--",
        "block": "[[[1,\\"\\\\n      \\"],[1,[28,[32,0,[\\"myhelper\\"]],null,null]],[1,\\"\\\\n      \\"],[46,[32,0,[\\"SomeComponent\\"]],null,null,null],[1,\\"\\\\n      \\"],[8,[32,0,[\\"SomeComponent\\"]],null,null,null],[1,\\"\\\\n      \\"],[8,[32,0,[\\"NamedComponent\\"]],null,null,null],[1,\\"\\\\n    \\"]],[],false,[\\"component\\"]]",
        "moduleName": "/rewritten-app/a.gts",
        "scope": () => [template__imports__],
        "isStrictMode": true
      }), templateOnly());
      if (import.meta.hot) {
        if (NamedComponent.prototype instanceof _ref0) {
          (async () => {
            const c = await import('ember-vite-hmr/virtual/component:my-components:NamedComponent.gjs');
            template__imports__.NamedComponent = c.default;
          })();
          import.meta.hot.accept('my-components');
        }
        if (Other.prototype instanceof _ref0) {
          (async () => {
            const c = await import('ember-vite-hmr/virtual/component:my-components:Other.gjs');
            template__imports__.Other = c.default;
          })();
          import.meta.hot.accept('my-components');
        }
        if (SomeComponent.prototype instanceof _ref0) {
          (async () => {
            const c = await import('ember-vite-hmr/virtual/component:my-components:default.gjs');
            template__imports__.SomeComponent = c.default;
          })();
          import.meta.hot.accept('my-components');
        }
        if (myhelper.prototype instanceof _ref0) {
          (async () => {
            const c = await import('ember-vite-hmr/virtual/component:my-helpers:default.gjs');
            template__imports__.myhelper = c.default;
          })();
          import.meta.hot.accept('my-helpers');
        }
      }"
    `);
  });
});
