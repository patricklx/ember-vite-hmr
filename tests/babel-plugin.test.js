import path from 'node:path';
import babel from '@babel/core';
import { describe, expect, it } from 'vitest';
import { Preprocessor } from 'content-tag';
import plugin, {
  hotAstProcessor,
  hmrImportMetadataCache,
  normalizeHmrCacheFilename,
} from '../lib/babel-plugin';
import emberBabel from 'babel-plugin-ember-template-compilation';
import TemplateCompiler from 'ember-cli-htmlbars/lib/template-compiler-plugin';

process.env['EMBER_VITE_HMR_ENABLED'] = 'true';
const p = new Preprocessor();

// The inlined decorator helper changes with every @babel/helpers release.
const stripBabelHelpers = (code) =>
  code.replace(/^function applyDecs2203RFactory\(\).*\n/m, '');

describe('convert template with hot reload helpers', () => {
  it('should convert hbs correctly', async () => {
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
          Template() {
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

    const result = await babel.transformAsync(imports + preTransformed, {
      filename: '/rewritten-app/a.hbs',
      babelrc: false,
      configFile: false,
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

    expect(
      stripBabelHelpers(result.code).replace(
        /\?timestamp=[^']+/g,
        "?timestamp=1'",
      ),
    ).toMatchInlineSnapshot(`
      "let _init_NamedComponent, _init_SomeComponent, _init_myhelper;
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
      template__imports__ = new class _Imports {
        static {
          [_init_NamedComponent, _init_SomeComponent, _init_myhelper] = _applyDecs2203R(this, [[tracked, 0, "NamedComponent"], [tracked, 0, "SomeComponent"], [tracked, 0, "myhelper"]], []).e;
        }
        NamedComponent = _init_NamedComponent(this, NamedComponent);
        SomeComponent = _init_SomeComponent(this, SomeComponent);
        myhelper = _init_myhelper(this, myhelper);
      }();
      export default precompileTemplate("\\n      {{(template__imports__.myhelper)}}\\n      <this.X />\\n      {{component this.X}}\\n      <template__imports__.SomeComponent />\\n      <template__imports__.NamedComponent />\\n    ", {
        moduleName: 'a.hbs',
        scope: () => ({
          template__imports__
        })
      });
      export const __hmr_import_metadata__ = {
        importVar: "template__imports__",
        bindings: ["NamedComponent", "SomeComponent", "myhelper"]
      };"
    `);

    const resultWired = await babel.transformAsync(imports + preTransformed, {
      filename: '/rewritten-app/a.hbs',
      babelrc: false,
      configFile: false,
      plugins: [
        plugin,
        ['@babel/plugin-proposal-decorators', { version: '2022-03' }],
        [
          emberBabel,
          {
            transforms: [transform, hotAstProcessor.transform],
            //targetFormat: 'hbs',
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

    expect(
      stripBabelHelpers(resultCode).replace(
        /\?timestamp=[^']+/g,
        '?timestamp=1',
      ),
    ).toMatchInlineSnapshot(`
      "let _init_NamedComponent, _init_SomeComponent, _init_myhelper;
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
      template__imports__ = new class _Imports {
        static {
          [_init_NamedComponent, _init_SomeComponent, _init_myhelper] = _applyDecs2203R(this, [[tracked, 0, "NamedComponent"], [tracked, 0, "SomeComponent"], [tracked, 0, "myhelper"]], []).e;
        }
        NamedComponent = _init_NamedComponent(this, NamedComponent);
        SomeComponent = _init_SomeComponent(this, SomeComponent);
        myhelper = _init_myhelper(this, myhelper);
      }();
      export default createTemplateFactory(
      /*
        
            {{(myhelper)}}
            <this.X />
            {{component this.X}}
            <SomeComponent />
            <NamedComponent />
          
      */
      {
        "id": null,
        "block": "[[[1,\\"\\\\n      \\"],[1,[28,[32,0,[\\"myhelper\\"]],null,null]],[1,\\"\\\\n      \\"],[8,[30,0,[\\"X\\"]],null,null,null],[1,\\"\\\\n      \\"],[46,[30,0,[\\"X\\"]],null,null,null],[1,\\"\\\\n      \\"],[8,[32,0,[\\"SomeComponent\\"]],null,null,null],[1,\\"\\\\n      \\"],[8,[32,0,[\\"NamedComponent\\"]],null,null,null],[1,\\"\\\\n    \\"]],[],[\\"component\\"]]",
        "moduleName": "a.hbs",
        "scope": () => ({
          template__imports__
        }),
        "isStrictMode": false
      });
      export const __hmr_import_metadata__ = {
        importVar: "template__imports__",
        bindings: ["NamedComponent", "SomeComponent", "myhelper"]
      };"
    `);
  });

  it('shares the computed import metadata with lib/hmr.ts via hmrImportMetadataCache', async () => {
    const code = `
      {{(myhelper)}}
      <SomeComponent />
      <NamedComponent />
    `;
    const preTransformed = TemplateCompiler.prototype.processString(
      code,
      'cache-test.hbs',
    );

    function transform(env) {
      return {
        visitor: {
          Template() {
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

    const filename = '/rewritten-app/cache-test.hbs';
    // @babel/core resolves `filename` against `cwd` before it becomes
    // `state.filename` (see config/partial.js) -- on POSIX that's a no-op
    // for an absolute path like this one, but on Windows it rewrites it to
    // an absolute, drive-letter-prefixed, backslash path (e.g.
    // `D:\rewritten-app\cache-test.hbs`) before lib/babel-plugin.ts's write
    // site ever normalizes it. Mirror that resolution here so the cache key
    // this test looks up matches what actually gets written on every OS.
    const cacheKey = normalizeHmrCacheFilename(path.resolve(filename));
    hmrImportMetadataCache.delete(cacheKey);

    const result = await babel.transformAsync(preTransformed, {
      filename,
      babelrc: false,
      configFile: false,
      plugins: [
        plugin,
        ['@babel/plugin-proposal-decorators', { version: '2022-03' }],
        [
          emberBabel,
          {
            transforms: [transform, hotAstProcessor.transform],
            targetFormat: 'hbs',
            enableLegacyModules: [
              'ember-cli-htmlbars',
              'ember-cli-htmlbars-inline-precompile',
              'htmlbars-inline-precompile',
            ],
          },
        ],
      ],
    });

    // The __hmr_import_metadata__ export is still emitted (lib/hmr.ts falls
    // back to parsing it back out when there's no cache entry for a file),
    // but the same importVar/bindings -- plus the resolved import statements
    // lib/hmr.ts would otherwise have to re-derive via its own traverse --
    // must already be available from the cache, keyed by filename.
    expect(result.code).toContain('export const __hmr_import_metadata__');

    const cached = hmrImportMetadataCache.get(cacheKey);
    expect(cached).toEqual({
      importVar: 'template__imports__',
      bindings: ['NamedComponent', 'SomeComponent', 'myhelper'],
      importStatements: [
        {
          local: 'NamedComponent',
          source: 'embroider_compat/components/named-component',
          specifier: 'default',
        },
        {
          local: 'SomeComponent',
          source: 'embroider_compat/components/some-component',
          specifier: 'default',
        },
        {
          local: 'myhelper',
          source: 'embroider_compat/helpers/my-helper',
          specifier: 'default',
        },
      ],
    });
  });

  it('should convert preprocessed gjs correctly', async () => {
    const code = `import { _ as _applyDecoratedDescriptor, a as _initializerDefineProperty, b as _defineProperty } from '../_rollupPluginBabelHelpers-dc0af20b.js';
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { defaultArgs } from '../utils/decorators.js';
import CarbonCopyButton from './copy-button.js';
import { concat, fn } from '@ember/helper';
import didInsert from '@ember/render-modifiers/modifiers/did-insert';
import eq from 'ember-truth-helpers/helpers/eq';
import { on } from '@ember/modifier';
import { helper } from '../helpers/set.js';
import not from 'ember-truth-helpers/helpers/not';
import htmlSafe from '../helpers/html-safe.js';
import templateOnly from '@ember/component/template-only';
import { precompileTemplate } from '@ember/template-compilation';
import { setComponentTemplate } from '@ember/component';

var _class, _descriptor, _descriptor2, _CarbonCodeSnippet;
const noop = () => '';
const PreCode = setComponentTemplate(precompileTemplate("\\n  <pre>\\n    {{~noop~}}\\n    <code ...attributes>\\n      {{~yield~}}\\n    </code>\\n    {{~noop~}}\\n  </pre>\\n", {
  strictMode: true,
  scope: () => ({
    noop
  })
}), templateOnly("@glimmer/component/template-only", ""));
let CarbonCodeSnippet = (_class = (_CarbonCodeSnippet = class CarbonCodeSnippet extends Component {
  constructor(...args) {
    super(...args);
    _initializerDefineProperty(this, "expanded", _descriptor, this);
    _defineProperty(this, "codeElement", void 0);
    _defineProperty(this, "carbonElement", void 0);
    _initializerDefineProperty(this, "args", _descriptor2, this);
  }
}, setComponentTemplate(precompileTemplate("\\n    {{#if (eq @type \\"default\\")}}\\n      <div class=\\"cds--snippet cds--snippet--single\\">\\n        <div class=\\"cds--snippet-container\\" aria-label=\\"Code Snippet Text\\">\\n          <PreCode {{didInsert (set this \\"carbonElement\\")}}>\\n            {{~yield~}}\\n          </PreCode>\\n        </div>\\n        <span class=\\"cds--popover-container cds--popover--caret cds--popover--high-contrast cds--popover--bottom cds--tooltip cds--icon-tooltip\\">\\n          <CopyButton @targetElement={{this.carbonElement}} />\\n        </span>\\n      </div>\\n    {{/if}}\\n    {{#if (eq @type \\"multiline\\")}}\\n      <div class=\\"cds--snippet cds--snippet--multi\\n          {{if this.expanded \\"cds--snippet--expand\\"}}\\" data-code-snippet>\\n        <div class=\\"cds--snippet-container\\" aria-label=\\"Code Snippet Text\\" style={{htmlSafe (concat \\"width: 100%; min-height: 48px;\\" (unless this.expanded \\"max-height: 240px;\\"))}}>\\n          <PreCode {{didInsert (set this \\"codeElement\\")}}>\\n            {{~yield~}}\\n          </PreCode>\\n        </div>\\n        <div class=\\"cds--snippet__overflow-indicator--right\\"></div>\\n        <span class=\\"cds--popover-container cds--popover--caret cds--popover--high-contrast cds--popover--bottom cds--tooltip cds--icon-tooltip\\">\\n          <CopyButton @targetElement={{this.codeElement}} />\\n        </span>\\n        <button {{on \\"click\\" (fn (set this \\"expanded\\") (not this.expanded))}} class=\\"cds--btn cds--btn--ghost cds--btn--sm cds--snippet-btn--expand\\" type=\\"button\\">\\n          <span class=\\"cds--snippet-btn--text\\" data-show-more-text=\\"Show more\\" data-show-less-text=\\"Show less\\">\\n            Show more\\n          </span>\\n          <svg class=\\"cds--icon-chevron--down\\" width=\\"12\\" height=\\"7\\" viewBox=\\"0 0 12 7\\" aria-label=\\"Show more icon\\">\\n            <title>\\n              Show more icon\\n            </title>\\n            <path fill-rule=\\"nonzero\\" d=\\"M6.002 5.55L11.27 0l.726.685L6.003 7 0 .685.726 0z\\" />\\n          </svg>\\n        </button>\\n      </div>\\n    {{/if}}\\n    {{#if (eq @type \\"inline\\")}}\\n      <CopyButton @inline={{true}}>\\n        {{~yield~}}\\n      </CopyButton>\\n    {{/if}}\\n  ", {
  strictMode: true,
  scope: () => ({
    eq,
    PreCode,
    didInsert,
    set: helper,
    CopyButton: CarbonCopyButton,
    htmlSafe,
    concat,
    on,
    fn,
    not
  })
}), _CarbonCodeSnippet), _CarbonCodeSnippet), (_descriptor = _applyDecoratedDescriptor(_class.prototype, "expanded", [tracked], {
  configurable: true,
  enumerable: true,
  writable: true,
  initializer: function () {
    return false;
  }
}), _descriptor2 = _applyDecoratedDescriptor(_class.prototype, "args", [defaultArgs], {
  configurable: true,
  enumerable: true,
  writable: true,
  initializer: function () {
    return {
      type: 'default'
    };
  }
})), _class);

export { CarbonCodeSnippet as default };
`;
    const preTransformed = p.process(code);
    const result = await babel.transformAsync(preTransformed.code, {
      filename: '/rewritten-app/a.gts',
      babelrc: false,
      configFile: false,
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
    expect(
      stripBabelHelpers(result.code).replace(
        /\?timestamp=[^']+/g,
        '?timestamp=1',
      ),
    ).toMatchInlineSnapshot(`
      "let _init_concat, _init_didInsert, _init_eq, _init_fn, _init_htmlSafe, _init_not, _init_on;
      function _applyDecs2203R(e, t, r) { return (_applyDecs2203R = applyDecs2203RFactory())(e, t, r); }
      function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
      function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
      function _setFunctionName(e, t, n) { "symbol" == typeof t && (t = (t = t.description) ? "[" + t + "]" : ""); try { Object.defineProperty(e, "name", { configurable: !0, value: n ? n + " " + t : t }); } catch (e) {} return e; }
      import { _ as _applyDecoratedDescriptor, a as _initializerDefineProperty, b as _defineProperty } from '../_rollupPluginBabelHelpers-dc0af20b.js';
      import Component from '@glimmer/component';
      import { tracked } from '@glimmer/tracking';
      import { defaultArgs } from '../utils/decorators.js';
      import CarbonCopyButton from './copy-button.js';
      import { concat, fn } from '@ember/helper';
      import didInsert from '@ember/render-modifiers/modifiers/did-insert';
      import eq from 'ember-truth-helpers/helpers/eq';
      import { on } from '@ember/modifier';
      import { helper } from '../helpers/set.js';
      import not from 'ember-truth-helpers/helpers/not';
      import htmlSafe from '../helpers/html-safe.js';
      import templateOnly from '@ember/component/template-only';
      import { precompileTemplate } from '@ember/template-compilation';
      import { setComponentTemplate } from '@ember/component';
      let template__imports__ = null;
      template__imports__ = new class _Imports {
        static {
          [_init_concat, _init_didInsert, _init_eq, _init_fn, _init_htmlSafe, _init_not, _init_on] = _applyDecs2203R(this, [[tracked, 0, "concat"], [tracked, 0, "didInsert"], [tracked, 0, "eq"], [tracked, 0, "fn"], [tracked, 0, "htmlSafe"], [tracked, 0, "not"], [tracked, 0, "on"]], []).e;
        }
        concat = _init_concat(this, concat);
        didInsert = _init_didInsert(this, didInsert);
        eq = _init_eq(this, eq);
        fn = _init_fn(this, fn);
        htmlSafe = _init_htmlSafe(this, htmlSafe);
        not = _init_not(this, not);
        on = _init_on(this, on);
      }();
      let template__imports__0 = template__imports__;
      var _class, _descriptor, _descriptor2, _CarbonCodeSnippet;
      const noop = () => '';
      const PreCode = setComponentTemplate(precompileTemplate("\\n  <pre>\\n    {{~noop~}}\\n    <code ...attributes>\\n      {{~yield~}}\\n    </code>\\n    {{~noop~}}\\n  </pre>\\n", {
        strictMode: true,
        scope: () => ({
          noop
        })
      }), templateOnly("@glimmer/component/template-only", ""));
      let CarbonCodeSnippet = (_class = (_CarbonCodeSnippet = class CarbonCodeSnippet extends Component {
        constructor(...args) {
          super(...args);
          _initializerDefineProperty(this, "expanded", _descriptor, this);
          _defineProperty(this, "codeElement", void 0);
          _defineProperty(this, "carbonElement", void 0);
          _initializerDefineProperty(this, "args", _descriptor2, this);
        }
      }, setComponentTemplate(precompileTemplate("\\n    {{#if (template__imports__0.eq @type \\"default\\")}}\\n      <div class=\\"cds--snippet cds--snippet--single\\">\\n        <div class=\\"cds--snippet-container\\" aria-label=\\"Code Snippet Text\\">\\n          <PreCode {{template__imports__0.didInsert (set this \\"carbonElement\\")}}>\\n            {{~yield~}}\\n          </PreCode>\\n        </div>\\n        <span class=\\"cds--popover-container cds--popover--caret cds--popover--high-contrast cds--popover--bottom cds--tooltip cds--icon-tooltip\\">\\n          <CopyButton @targetElement={{this.carbonElement}} />\\n        </span>\\n      </div>\\n    {{/if}}\\n    {{#if (template__imports__0.eq @type \\"multiline\\")}}\\n      <div class=\\"cds--snippet cds--snippet--multi\\n          {{if this.expanded \\"cds--snippet--expand\\"}}\\" data-code-snippet>\\n        <div class=\\"cds--snippet-container\\" aria-label=\\"Code Snippet Text\\" style={{template__imports__0.htmlSafe (template__imports__0.concat \\"width: 100%; min-height: 48px;\\" (unless this.expanded \\"max-height: 240px;\\"))}}>\\n          <PreCode {{template__imports__0.didInsert (set this \\"codeElement\\")}}>\\n            {{~yield~}}\\n          </PreCode>\\n        </div>\\n        <div class=\\"cds--snippet__overflow-indicator--right\\"></div>\\n        <span class=\\"cds--popover-container cds--popover--caret cds--popover--high-contrast cds--popover--bottom cds--tooltip cds--icon-tooltip\\">\\n          <CopyButton @targetElement={{this.codeElement}} />\\n        </span>\\n        <button {{template__imports__0.on \\"click\\" (template__imports__0.fn (set this \\"expanded\\") (template__imports__0.not this.expanded))}} class=\\"cds--btn cds--btn--ghost cds--btn--sm cds--snippet-btn--expand\\" type=\\"button\\">\\n          <span class=\\"cds--snippet-btn--text\\" data-show-more-text=\\"Show more\\" data-show-less-text=\\"Show less\\">\\n            Show more\\n          </span>\\n          <svg class=\\"cds--icon-chevron--down\\" width=\\"12\\" height=\\"7\\" viewBox=\\"0 0 12 7\\" aria-label=\\"Show more icon\\">\\n            <title>\\n              Show more icon\\n            </title>\\n            <path fill-rule=\\"nonzero\\" d=\\"M6.002 5.55L11.27 0l.726.685L6.003 7 0 .685.726 0z\\" />\\n          </svg>\\n        </button>\\n      </div>\\n    {{/if}}\\n    {{#if (template__imports__0.eq @type \\"inline\\")}}\\n      <CopyButton @inline={{true}}>\\n        {{~yield~}}\\n      </CopyButton>\\n    {{/if}}\\n  ", {
        strictMode: true,
        scope: () => ({
          PreCode,
          set: helper,
          CopyButton: CarbonCopyButton,
          template__imports__0
        })
      }), _CarbonCodeSnippet), _CarbonCodeSnippet), _descriptor = _applyDecoratedDescriptor(_class.prototype, "expanded", [tracked], {
        configurable: true,
        enumerable: true,
        writable: true,
        initializer: function () {
          return false;
        }
      }), _descriptor2 = _applyDecoratedDescriptor(_class.prototype, "args", [defaultArgs], {
        configurable: true,
        enumerable: true,
        writable: true,
        initializer: function () {
          return {
            type: 'default'
          };
        }
      }), _class);
      export { CarbonCodeSnippet as default };
      export const __hmr_import_metadata__ = {
        importVar: "template__imports__",
        bindings: ["concat", "didInsert", "eq", "fn", "htmlSafe", "not", "on"]
      };"
    `);
  });

  it('should convert gts correctly', async () => {
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
    const result = await babel.transformAsync(preTransformed.code, {
      filename: '/rewritten-app/a.gts',
      babelrc: false,
      configFile: false,
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
    expect(
      stripBabelHelpers(result.code).replace(
        /\?timestamp=[^']+/g,
        '?timestamp=1',
      ),
    ).toMatchInlineSnapshot(`
      "let _init_NamedComponent, _init_Other, _init_SomeComponent, _init_myhelper;
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
      let template__imports__ = null;
      template__imports__ = new class _Imports {
        static {
          [_init_NamedComponent, _init_Other, _init_SomeComponent, _init_myhelper] = _applyDecs2203R(this, [[tracked, 0, "NamedComponent"], [tracked, 0, "Other"], [tracked, 0, "SomeComponent"], [tracked, 0, "myhelper"]], []).e;
        }
        NamedComponent = _init_NamedComponent(this, NamedComponent);
        Other = _init_Other(this, Other);
        SomeComponent = _init_SomeComponent(this, SomeComponent);
        myhelper = _init_myhelper(this, myhelper);
      }();
      let template__imports__0 = template__imports__;
      const T = setComponentTemplate(precompileTemplate("<template__imports__.Other />", {
        strictMode: true,
        scope: () => ({
          template__imports__
        })
      }), templateOnly());
      export default setComponentTemplate(precompileTemplate("{{(template__imports__0.myhelper)}}\\n{{component template__imports__0.SomeComponent}}\\n<template__imports__0.SomeComponent />\\n<template__imports__0.NamedComponent />", {
        strictMode: true,
        scope: () => ({
          template__imports__0
        })
      }), templateOnly());
      export const __hmr_import_metadata__ = {
        importVar: "template__imports__",
        bindings: ["NamedComponent", "Other", "SomeComponent", "myhelper"]
      };"
    `);

    const resultWired = await babel.transformAsync(preTransformed.code, {
      filename: '/rewritten-app/a.gts',
      babelrc: false,
      configFile: false,
      plugins: [
        ['@babel/plugin-proposal-decorators', { version: '2022-03' }],
        plugin,
        [
          emberBabel,
          {
            transforms: [hotAstProcessor.transform],
          },
        ],
      ],
    });

    const resultCode = resultWired.code
      .replace(/"id": ".*",\n.*"block":/g, '"id": "--id--",\n  "block":')
      .replace(
        /"moduleName": ".*rewritten-app.*a\.gts"/g,
        '"moduleName": "/rewritten-app/a.gts"',
      );

    expect(
      stripBabelHelpers(resultCode).replace(
        /\?timestamp=[^']+/g,
        '?timestamp=1',
      ),
    ).toMatchInlineSnapshot(`
      "let _init_NamedComponent, _init_Other, _init_SomeComponent, _init_myhelper;
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
      let template__imports__ = null;
      template__imports__ = new class _Imports {
        static {
          [_init_NamedComponent, _init_Other, _init_SomeComponent, _init_myhelper] = _applyDecs2203R(this, [[tracked, 0, "NamedComponent"], [tracked, 0, "Other"], [tracked, 0, "SomeComponent"], [tracked, 0, "myhelper"]], []).e;
        }
        NamedComponent = _init_NamedComponent(this, NamedComponent);
        Other = _init_Other(this, Other);
        SomeComponent = _init_SomeComponent(this, SomeComponent);
        myhelper = _init_myhelper(this, myhelper);
      }();
      let template__imports__0 = template__imports__;
      const T = setComponentTemplate(createTemplateFactory(
      /*
        <Other />
      */
      {
        "id": null,
        "block": "[[[8,[32,0,[\\"Other\\"]],null,null,null]],[],[]]",
        "moduleName": "(unknown template module)",
        "scope": () => ({
          template__imports__
        }),
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
        "id": null,
        "block": "[[[1,[28,[32,0,[\\"myhelper\\"]],null,null]],[1,\\"\\\\n\\"],[46,[32,0,[\\"SomeComponent\\"]],null,null,null],[1,\\"\\\\n\\"],[8,[32,0,[\\"SomeComponent\\"]],null,null,null],[1,\\"\\\\n\\"],[8,[32,0,[\\"NamedComponent\\"]],null,null,null]],[],[\\"component\\"]]",
        "moduleName": "(unknown template module)",
        "scope": () => ({
          template__imports__0
        }),
        "isStrictMode": true
      }), templateOnly());
      export const __hmr_import_metadata__ = {
        importVar: "template__imports__",
        bindings: ["NamedComponent", "Other", "SomeComponent", "myhelper"]
      };"
    `);
  });
});
