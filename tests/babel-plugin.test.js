import babel from '@babel/core';
import { describe, expect, it } from 'vitest';
import { Preprocessor } from 'content-tag';
import plugin, {hotAstProcessor} from '../lib/babel-plugin';
import emberBabel from 'babel-plugin-ember-template-compilation';
import TemplateCompiler from 'ember-cli-htmlbars/lib/template-compiler-plugin';


const p = new Preprocessor();

describe('convert template with hot reload helpers', () => {

  it('should convert hbs correctly', () => {
    const code = `
      {{(myhelper)}}
      <SomeComponent />
      <NamedComponent />
    `;
    const preTransformed = TemplateCompiler.prototype.processString(code, 'a.hbs');


    // this will be done by @embroider/compat when all static
    const imports = `
      import NamedComponent from 'embroider_compat/components/named-component';
      import SomeComponent from 'embroider_compat/components/some-component';
      import myhelper from 'embroider_compat/helpers/my-helper';
      console.log(NamedComponent, SomeComponent, myhelper);
    `;

    function transform(env) {
      env.locals.push('NamedComponent', 'SomeComponent', 'myhelper');
      return {
        visitor: {}
      };
    }

    const result = babel.transform(imports + preTransformed, {
      filename: '/rewritten-app/a.hbs',
      plugins: [
        [emberBabel, {
          transforms: [transform, hotAstProcessor.transform],
          targetFormat: 'hbs',
          //compiler: require('ember-source/dist/ember-template-compiler'),
          enableLegacyModules: [
            'ember-cli-htmlbars',
            'ember-cli-htmlbars-inline-precompile',
            'htmlbars-inline-precompile',
          ],
        }],
        plugin,
      ]
    });

    expect(result.code).toMatchInlineSnapshot(`
      "function _initializerDefineProperty(target, property, descriptor, context) { if (!descriptor) return; Object.defineProperty(target, property, { enumerable: descriptor.enumerable, configurable: descriptor.configurable, writable: descriptor.writable, value: descriptor.initializer ? descriptor.initializer.call(context) : void 0 }); }
      function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
      function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
      function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
      function _applyDecoratedDescriptor(target, property, decorators, descriptor, context) { var desc = {}; Object.keys(descriptor).forEach(function (key) { desc[key] = descriptor[key]; }); desc.enumerable = !!desc.enumerable; desc.configurable = !!desc.configurable; if ('value' in desc || desc.initializer) { desc.writable = true; } desc = decorators.slice().reverse().reduce(function (desc, decorator) { return decorator(target, property, desc) || desc; }, desc); if (context && desc.initializer !== void 0) { desc.value = desc.initializer ? desc.initializer.call(context) : void 0; desc.initializer = undefined; } if (desc.initializer === void 0) { Object.defineProperty(target, property, desc); desc = null; } return desc; }
      function _initializerWarningHelper(descriptor, context) { throw new Error('Decorating class property failed. Please ensure that ' + 'transform-class-properties is enabled and runs after the decorators transform.'); }
      let imports_templates__;
      import { tracked as _tracked } from "@glimmer/tracking";
      import NamedComponent from 'embroider_compat/components/named-component';
      import SomeComponent from 'embroider_compat/components/some-component';
      import myhelper from 'embroider_compat/helpers/my-helper';
      if (import.meta.hot) {
        var _class, _descriptor, _descriptor2, _descriptor3;
        imports_templates__ = new (_class = class _Imports {}, (_descriptor = _applyDecoratedDescriptor(_class.prototype, "myhelper", [_tracked], {
          configurable: true,
          enumerable: true,
          writable: true,
          initializer: function () {
            return myhelper;
          }
        }), _descriptor2 = _applyDecoratedDescriptor(_class.prototype, "SomeComponent", [_tracked], {
          configurable: true,
          enumerable: true,
          writable: true,
          initializer: function () {
            return SomeComponent;
          }
        }), _descriptor3 = _applyDecoratedDescriptor(_class.prototype, "NamedComponent", [_tracked], {
          configurable: true,
          enumerable: true,
          writable: true,
          initializer: function () {
            return NamedComponent;
          }
        })), _class)();
      }
      import { precompileTemplate } from "@ember/template-compilation";
      console.log(NamedComponent, SomeComponent, myhelper);
      export default precompileTemplate("\\n      {{(imports_templates__.myhelper)}}\\n      <imports_templates__.SomeComponent />\\n      <imports_templates__.NamedComponent />\\n    ", {
        moduleName: 'a.hbs',
        scope: () => ({})
      });
      if (import.meta.hot) {
        import.meta.hot.accept('embroider_compat/helpers/my-helper', module => imports_templates__.myhelper = module['default']);
        import.meta.hot.accept('embroider_compat/components/some-component', module => imports_templates__.SomeComponent = module['default']);
        import.meta.hot.accept('embroider_compat/components/named-component', module => imports_templates__.NamedComponent = module['default']);
      }"
    `);

    const resultWired = babel.transform(imports + preTransformed, {
      filename: '/rewritten-app/a.hbs',
      plugins: [
        [emberBabel, {
          transforms: [transform, hotAstProcessor.transform],
          //targetFormat: 'hbs',
          compiler: require('ember-source/dist/ember-template-compiler'),
          enableLegacyModules: [
            'ember-cli-htmlbars',
            'ember-cli-htmlbars-inline-precompile',
            'htmlbars-inline-precompile',
          ],
        }],
        plugin,
      ]
    });

    const resultCode = resultWired.code.replace(/"id": ".*",\n.*"block":/, '"id": "--id--",\n  "block":');

    expect(resultCode).toMatchInlineSnapshot(`
      "function _initializerDefineProperty(target, property, descriptor, context) { if (!descriptor) return; Object.defineProperty(target, property, { enumerable: descriptor.enumerable, configurable: descriptor.configurable, writable: descriptor.writable, value: descriptor.initializer ? descriptor.initializer.call(context) : void 0 }); }
      function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
      function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
      function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
      function _applyDecoratedDescriptor(target, property, decorators, descriptor, context) { var desc = {}; Object.keys(descriptor).forEach(function (key) { desc[key] = descriptor[key]; }); desc.enumerable = !!desc.enumerable; desc.configurable = !!desc.configurable; if ('value' in desc || desc.initializer) { desc.writable = true; } desc = decorators.slice().reverse().reduce(function (desc, decorator) { return decorator(target, property, desc) || desc; }, desc); if (context && desc.initializer !== void 0) { desc.value = desc.initializer ? desc.initializer.call(context) : void 0; desc.initializer = undefined; } if (desc.initializer === void 0) { Object.defineProperty(target, property, desc); desc = null; } return desc; }
      function _initializerWarningHelper(descriptor, context) { throw new Error('Decorating class property failed. Please ensure that ' + 'transform-class-properties is enabled and runs after the decorators transform.'); }
      let imports_templates__;
      import { tracked as _tracked } from "@glimmer/tracking";
      import NamedComponent from 'embroider_compat/components/named-component';
      import SomeComponent from 'embroider_compat/components/some-component';
      import myhelper from 'embroider_compat/helpers/my-helper';
      console.log(NamedComponent, SomeComponent, myhelper);
      if (import.meta.hot) {
        var _class, _descriptor, _descriptor2, _descriptor3;
        imports_templates__ = new (_class = class _Imports {}, (_descriptor = _applyDecoratedDescriptor(_class.prototype, "myhelper", [_tracked], {
          configurable: true,
          enumerable: true,
          writable: true,
          initializer: function () {
            return myhelper;
          }
        }), _descriptor2 = _applyDecoratedDescriptor(_class.prototype, "SomeComponent", [_tracked], {
          configurable: true,
          enumerable: true,
          writable: true,
          initializer: function () {
            return SomeComponent;
          }
        }), _descriptor3 = _applyDecoratedDescriptor(_class.prototype, "NamedComponent", [_tracked], {
          configurable: true,
          enumerable: true,
          writable: true,
          initializer: function () {
            return NamedComponent;
          }
        })), _class)();
      }
      import { createTemplateFactory } from "@ember/template-factory";
      export default createTemplateFactory(
      /*
        
            {{(myhelper)}}
            <SomeComponent />
            <NamedComponent />
          
      */
      {
        "id": "--id--",
        "block": "[[[1,\\"\\\\n      \\"],[1,[28,[32,0,[\\"myhelper\\"]],null,null]],[1,\\"\\\\n      \\"],[8,[32,0,[\\"SomeComponent\\"]],null,null,null],[1,\\"\\\\n      \\"],[8,[32,0,[\\"NamedComponent\\"]],null,null,null],[1,\\"\\\\n    \\"]],[],false,[]]",
        "moduleName": "a.hbs",
        "scope": () => [imports_templates__],
        "isStrictMode": false
      });
      if (import.meta.hot) {
        import.meta.hot.accept('embroider_compat/helpers/my-helper', module => imports_templates__.myhelper = module['default']);
        import.meta.hot.accept('embroider_compat/components/some-component', module => imports_templates__.SomeComponent = module['default']);
        import.meta.hot.accept('embroider_compat/components/named-component', module => imports_templates__.NamedComponent = module['default']);
      }"
    `);
  })

  it('should convert gts correctly', () => {
    const code = `
       import SomeComponent, { NamedComponent, Other } from 'my-components';
       import myhelper from 'my-helpers';
       
       const T = <template>
            <Other />
        </template>;
        
        <template>
      {{(myhelper)}}
      <SomeComponent />
      <NamedComponent />
    </template>
    
    `;
    const preTransformed = p.process(code);
    const result = babel.transform(preTransformed, {
      filename: '/rewritten-app/a.gts',
      plugins: [
        ["@babel/plugin-proposal-decorators", { version: "2022-03" }],
        plugin,
        [emberBabel, {
          transforms: [hotAstProcessor.transform],
          targetFormat: 'hbs'
        }],
      ]
    });
    expect(result.code).toMatchInlineSnapshot(`
      "function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
      function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
      function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
      function applyDecs2203RFactory() { function createAddInitializerMethod(e, t) { return function (r) { !function (e, t) { if (e.v) throw new Error("attempted to call " + t + " after decoration was finished"); }(t, "addInitializer"), assertCallable(r, "An initializer"), e.push(r); }; } function memberDec(e, t, r, n, a, i, s, o) { var c; switch (a) { case 1: c = "accessor"; break; case 2: c = "method"; break; case 3: c = "getter"; break; case 4: c = "setter"; break; default: c = "field"; } var l, u, f = { kind: c, name: s ? "#" + t : t, static: i, private: s }, p = { v: !1 }; 0 !== a && (f.addInitializer = createAddInitializerMethod(n, p)), 0 === a ? s ? (l = r.get, u = r.set) : (l = function () { return this[t]; }, u = function (e) { this[t] = e; }) : 2 === a ? l = function () { return r.value; } : (1 !== a && 3 !== a || (l = function () { return r.get.call(this); }), 1 !== a && 4 !== a || (u = function (e) { r.set.call(this, e); })), f.access = l && u ? { get: l, set: u } : l ? { get: l } : { set: u }; try { return e(o, f); } finally { p.v = !0; } } function assertCallable(e, t) { if ("function" != typeof e) throw new TypeError(t + " must be a function"); } function assertValidReturnValue(e, t) { var r = typeof t; if (1 === e) { if ("object" !== r || null === t) throw new TypeError("accessor decorators must return an object with get, set, or init properties or void 0"); void 0 !== t.get && assertCallable(t.get, "accessor.get"), void 0 !== t.set && assertCallable(t.set, "accessor.set"), void 0 !== t.init && assertCallable(t.init, "accessor.init"); } else if ("function" !== r) { var n; throw n = 0 === e ? "field" : 10 === e ? "class" : "method", new TypeError(n + " decorators must return a function or void 0"); } } function applyMemberDec(e, t, r, n, a, i, s, o) { var c, l, u, f, p, d, h = r[0]; if (s ? c = 0 === a || 1 === a ? { get: r[3], set: r[4] } : 3 === a ? { get: r[3] } : 4 === a ? { set: r[3] } : { value: r[3] } : 0 !== a && (c = Object.getOwnPropertyDescriptor(t, n)), 1 === a ? u = { get: c.get, set: c.set } : 2 === a ? u = c.value : 3 === a ? u = c.get : 4 === a && (u = c.set), "function" == typeof h) void 0 !== (f = memberDec(h, n, c, o, a, i, s, u)) && (assertValidReturnValue(a, f), 0 === a ? l = f : 1 === a ? (l = f.init, p = f.get || u.get, d = f.set || u.set, u = { get: p, set: d }) : u = f);else for (var v = h.length - 1; v >= 0; v--) { var g; if (void 0 !== (f = memberDec(h[v], n, c, o, a, i, s, u))) assertValidReturnValue(a, f), 0 === a ? g = f : 1 === a ? (g = f.init, p = f.get || u.get, d = f.set || u.set, u = { get: p, set: d }) : u = f, void 0 !== g && (void 0 === l ? l = g : "function" == typeof l ? l = [l, g] : l.push(g)); } if (0 === a || 1 === a) { if (void 0 === l) l = function (e, t) { return t; };else if ("function" != typeof l) { var y = l; l = function (e, t) { for (var r = t, n = 0; n < y.length; n++) r = y[n].call(e, r); return r; }; } else { var m = l; l = function (e, t) { return m.call(e, t); }; } e.push(l); } 0 !== a && (1 === a ? (c.get = u.get, c.set = u.set) : 2 === a ? c.value = u : 3 === a ? c.get = u : 4 === a && (c.set = u), s ? 1 === a ? (e.push(function (e, t) { return u.get.call(e, t); }), e.push(function (e, t) { return u.set.call(e, t); })) : 2 === a ? e.push(u) : e.push(function (e, t) { return u.call(e, t); }) : Object.defineProperty(t, n, c)); } function applyMemberDecs(e, t) { for (var r, n, a = [], i = new Map(), s = new Map(), o = 0; o < t.length; o++) { var c = t[o]; if (Array.isArray(c)) { var l, u, f = c[1], p = c[2], d = c.length > 3, h = f >= 5; if (h ? (l = e, 0 !== (f -= 5) && (u = n = n || [])) : (l = e.prototype, 0 !== f && (u = r = r || [])), 0 !== f && !d) { var v = h ? s : i, g = v.get(p) || 0; if (!0 === g || 3 === g && 4 !== f || 4 === g && 3 !== f) throw new Error("Attempted to decorate a public method/accessor that has the same name as a previously decorated public method/accessor. This is not currently supported by the decorators plugin. Property name was: " + p); !g && f > 2 ? v.set(p, f) : v.set(p, !0); } applyMemberDec(a, l, c, p, f, h, d, u); } } return pushInitializers(a, r), pushInitializers(a, n), a; } function pushInitializers(e, t) { t && e.push(function (e) { for (var r = 0; r < t.length; r++) t[r].call(e); return e; }); } return function (e, t, r) { return { e: applyMemberDecs(e, t), get c() { return function (e, t) { if (t.length > 0) { for (var r = [], n = e, a = e.name, i = t.length - 1; i >= 0; i--) { var s = { v: !1 }; try { var o = t[i](n, { kind: "class", name: a, addInitializer: createAddInitializerMethod(r, s) }); } finally { s.v = !0; } void 0 !== o && (assertValidReturnValue(10, o), n = o); } return [n, function () { for (var e = 0; e < r.length; e++) r[e].call(n); }]; } }(e, r); } }; }; }
      function _applyDecs2203R(e, t, r) { return (_applyDecs2203R = applyDecs2203RFactory())(e, t, r); }
      let imports_templates__;
      import { tracked as _tracked } from "@glimmer/tracking";
      import SomeComponent, _ref20, { Other, NamedComponent } from "my-components";
      import _ref0 from "my-helpers";
      import { precompileTemplate } from "@ember/template-compilation";
      import { setComponentTemplate } from "@ember/component";
      import templateOnly from "@ember/component/template-only";
      const T = setComponentTemplate(precompileTemplate("\\n            <imports_templates__.Other />\\n        ", {
        scope: () => ({
          Other
        }),
        strictMode: true
      }), templateOnly());
      export default setComponentTemplate(precompileTemplate("\\n      {{(imports_templates__.myhelper)}}\\n      <imports_templates__.SomeComponent />\\n      <imports_templates__.NamedComponent />\\n    ", {
        scope: () => ({
          myhelper: _ref0,
          SomeComponent,
          NamedComponent
        }),
        strictMode: true
      }), templateOnly());
      if (import.meta.hot) {
        var _init_Other, _init_myhelper, _init_SomeComponent, _init_NamedComponent, _class;
        imports_templates__ = new (_class = class _Imports {
          constructor() {
            _defineProperty(this, "Other", _init_Other(this, Other));
            _defineProperty(this, "myhelper", _init_myhelper(this, _ref0));
            _defineProperty(this, "SomeComponent", _init_SomeComponent(this, _ref20));
            _defineProperty(this, "NamedComponent", _init_NamedComponent(this, NamedComponent));
          }
        }, [_init_Other, _init_myhelper, _init_SomeComponent, _init_NamedComponent] = _applyDecs2203R(_class, [[_tracked, 0, "Other"], [_tracked, 0, "myhelper"], [_tracked, 0, "SomeComponent"], [_tracked, 0, "NamedComponent"]], []).e, _class)();
        import.meta.hot.accept('my-components', module => imports_templates__.Other = module['Other']);
        import.meta.hot.accept('my-helpers', module => imports_templates__.myhelper = module['default']);
        import.meta.hot.accept('my-components', module => imports_templates__.SomeComponent = module['default']);
        import.meta.hot.accept('my-components', module => imports_templates__.NamedComponent = module['NamedComponent']);
      }"
    `);

    const resultWired = babel.transform(preTransformed, {
      filename: 'rewritten-app/a.gts',
      plugins: [
        ["@babel/plugin-proposal-decorators", { version: "2022-03" }],
        plugin,
        [emberBabel, {
          transforms: [hotAstProcessor.transform],
          compiler: require('ember-source/dist/ember-template-compiler')
        }],
      ]
    });

    const resultCode = resultWired.code.replace(/"id": ".*",\n.*"block":/g, '"id": "--id--",\n  "block":');

    expect(resultCode).toMatchInlineSnapshot(`
      "function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
      function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
      function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
      function applyDecs2203RFactory() { function createAddInitializerMethod(e, t) { return function (r) { !function (e, t) { if (e.v) throw new Error("attempted to call " + t + " after decoration was finished"); }(t, "addInitializer"), assertCallable(r, "An initializer"), e.push(r); }; } function memberDec(e, t, r, n, a, i, s, o) { var c; switch (a) { case 1: c = "accessor"; break; case 2: c = "method"; break; case 3: c = "getter"; break; case 4: c = "setter"; break; default: c = "field"; } var l, u, f = { kind: c, name: s ? "#" + t : t, static: i, private: s }, p = { v: !1 }; 0 !== a && (f.addInitializer = createAddInitializerMethod(n, p)), 0 === a ? s ? (l = r.get, u = r.set) : (l = function () { return this[t]; }, u = function (e) { this[t] = e; }) : 2 === a ? l = function () { return r.value; } : (1 !== a && 3 !== a || (l = function () { return r.get.call(this); }), 1 !== a && 4 !== a || (u = function (e) { r.set.call(this, e); })), f.access = l && u ? { get: l, set: u } : l ? { get: l } : { set: u }; try { return e(o, f); } finally { p.v = !0; } } function assertCallable(e, t) { if ("function" != typeof e) throw new TypeError(t + " must be a function"); } function assertValidReturnValue(e, t) { var r = typeof t; if (1 === e) { if ("object" !== r || null === t) throw new TypeError("accessor decorators must return an object with get, set, or init properties or void 0"); void 0 !== t.get && assertCallable(t.get, "accessor.get"), void 0 !== t.set && assertCallable(t.set, "accessor.set"), void 0 !== t.init && assertCallable(t.init, "accessor.init"); } else if ("function" !== r) { var n; throw n = 0 === e ? "field" : 10 === e ? "class" : "method", new TypeError(n + " decorators must return a function or void 0"); } } function applyMemberDec(e, t, r, n, a, i, s, o) { var c, l, u, f, p, d, h = r[0]; if (s ? c = 0 === a || 1 === a ? { get: r[3], set: r[4] } : 3 === a ? { get: r[3] } : 4 === a ? { set: r[3] } : { value: r[3] } : 0 !== a && (c = Object.getOwnPropertyDescriptor(t, n)), 1 === a ? u = { get: c.get, set: c.set } : 2 === a ? u = c.value : 3 === a ? u = c.get : 4 === a && (u = c.set), "function" == typeof h) void 0 !== (f = memberDec(h, n, c, o, a, i, s, u)) && (assertValidReturnValue(a, f), 0 === a ? l = f : 1 === a ? (l = f.init, p = f.get || u.get, d = f.set || u.set, u = { get: p, set: d }) : u = f);else for (var v = h.length - 1; v >= 0; v--) { var g; if (void 0 !== (f = memberDec(h[v], n, c, o, a, i, s, u))) assertValidReturnValue(a, f), 0 === a ? g = f : 1 === a ? (g = f.init, p = f.get || u.get, d = f.set || u.set, u = { get: p, set: d }) : u = f, void 0 !== g && (void 0 === l ? l = g : "function" == typeof l ? l = [l, g] : l.push(g)); } if (0 === a || 1 === a) { if (void 0 === l) l = function (e, t) { return t; };else if ("function" != typeof l) { var y = l; l = function (e, t) { for (var r = t, n = 0; n < y.length; n++) r = y[n].call(e, r); return r; }; } else { var m = l; l = function (e, t) { return m.call(e, t); }; } e.push(l); } 0 !== a && (1 === a ? (c.get = u.get, c.set = u.set) : 2 === a ? c.value = u : 3 === a ? c.get = u : 4 === a && (c.set = u), s ? 1 === a ? (e.push(function (e, t) { return u.get.call(e, t); }), e.push(function (e, t) { return u.set.call(e, t); })) : 2 === a ? e.push(u) : e.push(function (e, t) { return u.call(e, t); }) : Object.defineProperty(t, n, c)); } function applyMemberDecs(e, t) { for (var r, n, a = [], i = new Map(), s = new Map(), o = 0; o < t.length; o++) { var c = t[o]; if (Array.isArray(c)) { var l, u, f = c[1], p = c[2], d = c.length > 3, h = f >= 5; if (h ? (l = e, 0 !== (f -= 5) && (u = n = n || [])) : (l = e.prototype, 0 !== f && (u = r = r || [])), 0 !== f && !d) { var v = h ? s : i, g = v.get(p) || 0; if (!0 === g || 3 === g && 4 !== f || 4 === g && 3 !== f) throw new Error("Attempted to decorate a public method/accessor that has the same name as a previously decorated public method/accessor. This is not currently supported by the decorators plugin. Property name was: " + p); !g && f > 2 ? v.set(p, f) : v.set(p, !0); } applyMemberDec(a, l, c, p, f, h, d, u); } } return pushInitializers(a, r), pushInitializers(a, n), a; } function pushInitializers(e, t) { t && e.push(function (e) { for (var r = 0; r < t.length; r++) t[r].call(e); return e; }); } return function (e, t, r) { return { e: applyMemberDecs(e, t), get c() { return function (e, t) { if (t.length > 0) { for (var r = [], n = e, a = e.name, i = t.length - 1; i >= 0; i--) { var s = { v: !1 }; try { var o = t[i](n, { kind: "class", name: a, addInitializer: createAddInitializerMethod(r, s) }); } finally { s.v = !0; } void 0 !== o && (assertValidReturnValue(10, o), n = o); } return [n, function () { for (var e = 0; e < r.length; e++) r[e].call(n); }]; } }(e, r); } }; }; }
      function _applyDecs2203R(e, t, r) { return (_applyDecs2203R = applyDecs2203RFactory())(e, t, r); }
      let imports_templates__;
      import { tracked as _tracked } from "@glimmer/tracking";
      import SomeComponent, _ref20, { Other, NamedComponent } from "my-components";
      import _ref0 from "my-helpers";
      import { createTemplateFactory } from "@ember/template-factory";
      import { setComponentTemplate } from "@ember/component";
      import templateOnly from "@ember/component/template-only";
      const T = setComponentTemplate(createTemplateFactory(
      /*
        
                  <Other />
              
      */
      {
        "id": "--id--",
        "block": "[[[1,\\"\\\\n            \\"],[8,[32,0,[\\"Other\\"]],null,null,null],[1,\\"\\\\n        \\"]],[],false,[]]",
        "moduleName": "/Users/patrickpircher/IdeaProjects/ember-vite-hmr/rewritten-app/a.gts",
        "scope": () => [imports_templates__],
        "isStrictMode": true
      }), templateOnly());
      export default setComponentTemplate(createTemplateFactory(
      /*
        
            {{(myhelper)}}
            <SomeComponent />
            <NamedComponent />
          
      */
      {
        "id": "--id--",
        "block": "[[[1,\\"\\\\n      \\"],[1,[28,[32,0,[\\"myhelper\\"]],null,null]],[1,\\"\\\\n      \\"],[8,[32,0,[\\"SomeComponent\\"]],null,null,null],[1,\\"\\\\n      \\"],[8,[32,0,[\\"NamedComponent\\"]],null,null,null],[1,\\"\\\\n    \\"]],[],false,[]]",
        "moduleName": "/Users/patrickpircher/IdeaProjects/ember-vite-hmr/rewritten-app/a.gts",
        "scope": () => [imports_templates__],
        "isStrictMode": true
      }), templateOnly());
      if (import.meta.hot) {
        var _init_Other, _init_myhelper, _init_SomeComponent, _init_NamedComponent, _class;
        imports_templates__ = new (_class = class _Imports {
          constructor() {
            _defineProperty(this, "Other", _init_Other(this, Other));
            _defineProperty(this, "myhelper", _init_myhelper(this, _ref0));
            _defineProperty(this, "SomeComponent", _init_SomeComponent(this, _ref20));
            _defineProperty(this, "NamedComponent", _init_NamedComponent(this, NamedComponent));
          }
        }, [_init_Other, _init_myhelper, _init_SomeComponent, _init_NamedComponent] = _applyDecs2203R(_class, [[_tracked, 0, "Other"], [_tracked, 0, "myhelper"], [_tracked, 0, "SomeComponent"], [_tracked, 0, "NamedComponent"]], []).e, _class)();
        import.meta.hot.accept('my-components', module => imports_templates__.Other = module['Other']);
        import.meta.hot.accept('my-helpers', module => imports_templates__.myhelper = module['default']);
        import.meta.hot.accept('my-components', module => imports_templates__.SomeComponent = module['default']);
        import.meta.hot.accept('my-components', module => imports_templates__.NamedComponent = module['NamedComponent']);
      }"
    `);
  });
});
