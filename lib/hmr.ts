import path from 'path';
import { fileURLToPath } from 'url';
import { Plugin, ViteDevServer } from 'vite';
import { NodePath, parseSync } from '@babel/core';
import traverseModule from '@babel/traverse';
const traverse = (traverseModule as any).default || traverseModule;
import { readFile } from 'fs/promises';
import { hmrImportMetadataCache } from './babel-plugin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Above this many distinct named blocks, fall back to forwarding all of them
// unconditionally rather than generating an exponential number of branches
// (see generateInvocations below for why branching is needed at all).
const MAX_COMBINATORIAL_YIELDS = 8;

// Safety cap on how many `extends` links resolveYieldSource will walk while
// looking for an inherited template (see its own doc comment) - real
// component hierarchies never get remotely this deep, this only guards
// against a pathological/cyclic chain.
const MAX_EXTENDS_DEPTH = 20;

function blockTag(y: string) {
  return `<:${y} as |a b c d e f g h i j k l|>{{yield a b c d e f g h i j k l to='${y}'}}</:${y}>`;
}

function invocation(selected: string[]) {
  if (!selected.length) {
    return `<this.curried @__hot__={{this.hot}} ...attributes />`;
  }
  return `<this.curried @__hot__={{this.hot}} ...attributes>${selected.map(blockTag).join('\n')}</this.curried>`;
}

// Glimmer determines a target component's `(has-block "y")` purely from
// whether a `<:y>` named block tag is structurally present on the
// invocation, not from whether that block's content renders anything, and
// named block tags cannot be nested inside `{{#if}}` (a "named block nested
// in a normal block" compile error). So a per-block `{{#if (has-block 'y')}}
// <:y>...</:y>{{/if}}` inside a single invocation can't work — instead this
// recursively branches on `(has-block y)` for each known named block to
// build one fully static invocation per combination of blocks the caller
// actually passed, so blocks not passed are truly absent rather than merely
// empty (see #531).
function generateInvocations(remaining: string[], selected: string[]): string {
  if (!remaining.length) {
    return invocation(selected);
  }
  const [y, ...rest] = remaining;
  return `{{#if (has-block '${y}')}}${generateInvocations(rest, [...selected, y])}{{else}}${generateInvocations(rest, selected)}{{/if}}`;
}

function generateContent(yields: string[]) {
  if (!yields.includes('default')) {
    yields.push('default');
  }
  if (yields.length > MAX_COMBINATORIAL_YIELDS) {
    let all = yields.map((y) => `(has-block '${y}')`).join(' ');
    return `
    {{#if (notAny ${all})}}
        <this.curried @__hot__={{this.hot}} ...attributes />
    {{else}}
        ${invocation(yields)}
    {{/if}}
  `;
  }
  return generateInvocations(yields, []);
}

const getHotComponent = (imp: string, specifier: string, yields: string[]) => `
import { ${specifier} as TargetComponent } from "${imp}";
import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { createComputeRef } from "@glimmer/reference";
import { curry } from '@glimmer/runtime';
import { registerDestructor } from '@ember/destroyable';
import { getInternalComponentManager, setInternalComponentManager } from '@glimmer/manager';

function notAny(...yields) {
  return !yields.some((y) => !!y);
}

const hotCallbacks = new Set();

if (import.meta.hot) {
  import.meta.hot.accept('${imp}', (module) => {
    import.meta.hot.data.latestModule = module;
    for (const callback of hotCallbacks) {
      callback(module);
    }
  });
}

// Stack of CapturedArguments (see @glimmer/interfaces), pushed by the shadow
// component manager below right before it constructs a HotComponent instance,
// and peeked (not popped) here in the constructor. It is always non-empty at
// this point because HotComponent is only ever created through that manager.
const capturedArgsStack = [];

export default class HotComponent extends Component {
  @tracked curried;
  hot = {};
  constructor(owner, args) {
    super(owner, args);
    const capturedArgs = capturedArgsStack[capturedArgsStack.length - 1];
    const named = {};
    const positional = [];
    for (const name of Object.keys(args)) {
      // Forward the caller's original, updatable reference (e.g. a path like
      // "this.value") instead of wrapping the reified value in a fresh
      // read-only compute ref. A read-only ref fails Ember's "You can only
      // pass a path to mut" check, breaking {{mut @arg}} in wrapped components.
      named[name] = capturedArgs?.named[name] ?? createComputeRef(() => args[name]);
    }
    const CurriedComponent = 0;
    // After an accepted update this module is not re-evaluated, so the static
    // TargetComponent binding still points at the pre-update module. Instances
    // created after the update must curry the latest accepted class instead.
    const Target = import.meta.hot?.data.latestModule?.default ?? TargetComponent;
    this.curried = curry(CurriedComponent, Target, owner, { positional, named});
    if (import.meta.hot) {
      const callback = (module) => {
        this.curried = curry(CurriedComponent, module.default, owner, { positional, named});
      };
      hotCallbacks.add(callback);
      registerDestructor(this, () => {
        hotCallbacks.delete(callback);
      });
    }
  }

  <template>
    ${generateContent(yields)}
  </template>
}

// HotComponent's own args (the reified values passed to its constructor
// above) only expose values, not the underlying VM references, so the raw
// references have to be captured one level down, in the internal component
// manager's create() hook, before Ember reifies them into that value-only
// proxy. Shadowing the manager (rather than patching the shared default
// manager's create()) scopes the capture to HotComponent only; getManager()
// walks the prototype chain and finds this before reaching @glimmer/component's
// default manager.
const defaultManager = getInternalComponentManager(Component);
const shadowManager = Object.create(defaultManager);
shadowManager.create = function (owner, definition, vmArgs) {
  capturedArgsStack.push(vmArgs.capture());
  try {
    return defaultManager.create(owner, definition, vmArgs);
  } finally {
    capturedArgsStack.pop();
  }
};
// Glimmer's debug render tree normally adds one 'component' node per
// invoked component instance (see VM_GET_COMPONENT_SELF_OP). Returning no
// nodes here suppresses that node for HotComponent itself, so only the
// real, curried target component (invoked in HotComponent's own template)
// shows up in ember-inspector's component tree - this is the same hook
// Ember core uses internally to keep its own {{outlet}}/{{mount}} wrapper
// machinery out of (or relabeled in) that tree (see OutletComponentManager
// and MountManager in ember-source).
shadowManager.getDebugCustomRenderTree = function () {
  return [];
};
setInternalComponentManager(shadowManager, HotComponent);
`;

const cachedYields: Record<
  string,
  {
    yields: Set<string>;
    modules: string[];
  }
> = {};

function getYieldsFromFile(
  filename: string,
  content: string,
  noCache?: boolean,
) {
  if (cachedYields[filename] && !noCache) {
    return cachedYields[filename];
  }
  // very basic, todo: make this use AST
  const matches = content.matchAll(/to=['"\\]+(\w+)['"\\]+/g);
  const yields = new Set(
    [...matches].map((m) => m?.[1]).filter((m) => !!m) as string[],
  );
  if (noCache) {
    return {
      yields,
      modules: [],
    };
  }
  cachedYields[filename] = {
    yields,
    modules: [],
  };
  return cachedYields[filename];
}

function difference(a: Set<string>, b: Set<string>) {
  const diff = [];
  for (const bElement of b) {
    if (!a.has(bElement)) {
      diff.push(bElement);
    }
  }
  return diff;
}

// Helper function to normalize paths consistently across platforms
function normalizePath(inputPath: string): string {
  // Always convert backslashes to forward slashes
  return inputPath.replace(/\\/g, '/');
}

// The compiled backing class embeds an import specifier as a browser-facing
// URL (i.e. prefixed with the configured vite `base`), since that's what
// gets sent to the client. But `server.transformRequest` is an internal API
// keyed by root-relative ids, so the base has to be stripped back off before
// reusing that specifier, or a lookup 404s under a non-root base.
function stripBase(specifier: string, base: string): string {
  if (base !== '/' && specifier.startsWith(base)) {
    return `/${specifier.slice(base.length)}`;
  }
  return specifier;
}

// A component's compiled module only calls `setComponentTemplate` on itself
// when it owns a template directly (an inline `<template>`); it's absent
// both for a classic component whose template lives in a separately
// resolved colocated `.hbs` (see the `.hbs` import check this feeds into)
// and for a component with no template of its own at all, which inherits
// whatever's registered on its nearest ancestor class instead (Glimmer's
// `getComponentTemplate`/`setComponentTemplate`, vendored in ember-source's
// `@glimmer/manager`, resolve a component's template by walking
// `Object.getPrototypeOf` up the prototype chain - the same mechanism
// `getInternalComponentManager` uses, see the `shadowManager` comment above).
function findSuperclassImportSource(content: string): string | null {
  let result;
  try {
    result = parseSync(content, {
      filename: 'hmr-extends-check.js',
      ast: true,
      code: false,
      configFile: false,
      babelrc: false,
      plugins: [
        ['@babel/plugin-syntax-typescript', { isTSX: true }],
        ['@babel/plugin-proposal-decorators', { version: '2022-03' }],
      ],
    });
  } catch {
    return null;
  }
  if (!result) {
    return null;
  }

  // Prefer the default-exported class specifically (that's always the
  // component itself) over "the first class with a superclass in the file",
  // since a file can declare other, unrelated classes above it (a local
  // helper class, etc.) that would otherwise be matched instead.
  let superName: string | null = null;
  traverse(result, {
    ExportDefaultDeclaration(
      path: NodePath<{
        declaration: {
          type: string;
          name?: string;
          superClass?: { type?: string; name?: string };
        };
      }>,
    ) {
      const declaration = path.node.declaration;
      let classNode = declaration;
      if (declaration.type === 'Identifier' && declaration.name) {
        const binding = path.scope.getBinding(declaration.name);
        if (
          binding?.path.isClassDeclaration() ||
          binding?.path.isClassExpression()
        ) {
          classNode = binding.path.node as unknown as typeof declaration;
        }
      }
      const superClass = classNode.superClass;
      if (superClass?.type === 'Identifier' && superClass.name) {
        superName = superClass.name;
      }
    },
  });
  if (!superName) {
    // Fall back to the first class with a superclass anywhere in the file
    // (e.g. a non-default-exported component, or an export form the check
    // above doesn't specifically handle).
    traverse(result, {
      'ClassDeclaration|ClassExpression'(
        path: NodePath<{ superClass?: { type?: string; name?: string } }>,
      ) {
        if (superName) {
          return;
        }
        const superClass = path.node.superClass;
        if (superClass?.type === 'Identifier' && superClass.name) {
          superName = superClass.name;
        }
      },
    });
  }
  if (!superName) {
    return null;
  }

  let source: string | null = null;
  traverse(result, {
    ImportDeclaration(
      path: NodePath<{
        specifiers: Array<{ local: { name: string } }>;
        source: { value: string };
      }>,
    ) {
      if (source) {
        return;
      }
      if (path.node.specifiers.some((s) => s.local.name === superName)) {
        source = path.node.source.value;
      }
    },
  });
  return source;
}

// If `content` (already run through `server.transformRequest`) registers a
// template on itself - either inline, or via a colocated `.hbs` import -
// returns that template's own source. Returns null when this file has no
// template of its own to scan, meaning any named blocks it uses have to be
// found on an ancestor class instead (see resolveYieldSource).
async function resolveOwnTemplateSource(
  server: ViteDevServer,
  base: string,
  filename: string,
  content: string,
): Promise<{ filename: string; content: string } | null> {
  // For a classic component with a separately resolved template (a colocated
  // `.hbs` file next to a backing class, or a template-only component), the
  // compiled backing module only *imports* its template (e.g. `import TEMPLATE
  // from "./foo.hbs?import"`); it doesn't inline it. Any {{yield ... to="..."}}
  // usage lives in that template file, so it has to be fetched and scanned
  // separately, otherwise named blocks other than "default" are never detected
  // and get silently dropped by the generated hot-reload wrapper.
  const templateImportMatch = content.match(
    /\bfrom\s*['"]([^'"]+\.hbs(?:\?[^'"]*)?)['"]/,
  );
  if (templateImportMatch) {
    const templateSpecifier = stripBase(templateImportMatch[1]!, base);
    const templateRes = await server.transformRequest(templateSpecifier);
    return { filename: templateSpecifier, content: templateRes?.code ?? '' };
  }
  if (content.includes('setComponentTemplate(')) {
    return { filename, content };
  }
  return null;
}

// Determines which file's source should be scanned for named-block
// (`{{yield ... to="..."}}`) usage for the component at `filename`/`content`.
// Usually that's the component's own file (or its colocated `.hbs`, handled
// by resolveOwnTemplateSource). But a component with no template of its own
// renders whatever template is registered on its nearest ancestor class (see
// resolveOwnTemplateSource's doc comment) - previously this only ever
// scanned the child's own (template-less) file, silently dropping every
// named block other than "default" for any component subclassed without its
// own template. This walks the `extends` chain, resolving each ancestor's
// import the same way Vite already resolved it in the already-transformed
// source, until one with its own template is found.
async function resolveYieldSource(
  server: ViteDevServer,
  base: string,
  filename: string,
  content: string,
): Promise<{ filename: string; content: string }> {
  const own = await resolveOwnTemplateSource(server, base, filename, content);
  if (own) {
    return own;
  }

  const seen = new Set<string>([filename]);
  let currentContent = content;
  for (let i = 0; i < MAX_EXTENDS_DEPTH; i++) {
    const superSource = findSuperclassImportSource(currentContent);
    if (!superSource) {
      break;
    }
    const superSpecifier = stripBase(superSource, base);
    // Framework/addon base classes live in node_modules and are never
    // hot-tracked by this plugin (see the node_modules skip in `transform`);
    // stop there rather than walking into vendored internals.
    if (seen.has(superSpecifier) || superSpecifier.includes('node_modules')) {
      break;
    }
    seen.add(superSpecifier);
    let superContent: string | undefined;
    try {
      // Unlike the `.hbs` specifier resolveOwnTemplateSource requests
      // (always something Vite itself already resolved for a file we
      // successfully transformed), this specifier can be anything a
      // superclass import resolved to, including forms
      // `transformRequest` can't handle. Failing to resolve an ancestor's
      // template is the same "no named blocks found" outcome as before
      // this fix existed - it must never fail the whole component load.
      const superRes = await server.transformRequest(superSpecifier);
      superContent = superRes?.code;
    } catch {
      break;
    }
    if (!superContent) {
      break;
    }
    const superOwn = await resolveOwnTemplateSource(
      server,
      base,
      superSpecifier,
      superContent,
    );
    if (superOwn) {
      return superOwn;
    }
    currentContent = superContent;
  }
  return { filename, content };
}

const virtualPrefix = '/ember-vite-hmr/virtual/component:';

// Embroider's resolver registry. It's the binding the app entry's HMR hook
// mutates, so we use it to locate that entry. Embroider keeps this as an
// internal literal (not a public export), so we mirror the string here.
const compatModulesSpecifier = '@embroider/virtual/compat-modules';

export function hmr(enableViteHmrForModes: string[] = ['development']): Plugin {
  let base = '/';
  let server: ViteDevServer;
  return {
    name: 'hmr-plugin',
    enforce: 'post',
    config(config, env) {
      // The per-component hot wrapper (see getHotComponent) imports the first
      // four of these, but it is generated/served on demand, so it is never
      // part of the static module graph Vite's dependency scanner crawls on
      // the first pass. `@ember/component/template-only` has the same
      // problem for a different reason: it's injected by the template
      // compiler into a template-only component's compiled output, which the
      // scanner (source-only) never sees either. Without pre-declaring them,
      // the browser requests them on boot, Vite discovers "new" deps and
      // triggers a re-optimize + full page reload.
      //
      // We must use the Embroider-rewritten `ember-source/...` subpaths: the
      // bare `@glimmer/reference` etc. specifiers the wrapper writes cannot be
      // resolved by optimizeDeps.include. (`@glimmer/component` and
      // `@glimmer/tracking` are omitted on purpose — normal app code already
      // pulls them into the scan.)
      if (!enableViteHmrForModes.includes(env.mode)) {
        return;
      }
      // With `optimizeDeps.noDiscovery: true`, Vite never scans the app's own
      // source, so nothing else pulls these same glimmer subpaths into the
      // optimizer. Forcing them into `include` then creates a second,
      // separately pre-bundled copy of the glimmer VM alongside the
      // unoptimized one the rest of the (unscanned) app actually uses,
      // leading to "The global context for Glimmer VM was not set" (#554).
      // There's nothing useful this hook can pre-declare in that mode, so
      // skip it entirely rather than fight the user's own dep-optimization
      // config.
      if (config.optimizeDeps?.noDiscovery) {
        return;
      }
      return {
        optimizeDeps: {
          include: [
            'ember-source/@glimmer/reference/index.js',
            'ember-source/@glimmer/runtime/index.js',
            'ember-source/@ember/destroyable/index.js',
            'ember-source/@glimmer/manager/index.js',
            'ember-source/@ember/component/template-only.js',
          ],
        },
      };
    },
    configureServer(s) {
      server = s;
    },
    configResolved(config) {
      base = config.base;
      // `import.meta.hot` is never truthy without a dev server, so a `vite
      // build` that resolves mode to 'development' would inject permanently
      // dead HMR scaffolding and leave imported components bound to undefined.
      process.env.EMBER_VITE_HMR_ENABLED = (
        config.command === 'serve' &&
        enableViteHmrForModes.includes(config.mode)
      ).toString();
    },
    async resolveId(id, importer, meta) {
      if (id.includes('@ember-vite-hmr/setup-ember-hmr.js')) {
        return id;
      }
      if (importer?.startsWith(virtualPrefix)) {
        const newImporter = path.join(process.cwd(), 'package.json');
        importer = newImporter;
        return this.resolve(id, importer, meta);
      }
      if (id.startsWith(virtualPrefix)) {
        let [imp, specifier] = id
          .split('?')[0]!
          .slice(virtualPrefix.length)
          .split('::');
        if (imp?.startsWith('.')) {
          const r = await this.resolve(imp, importer);
          return id.replace(`${imp}::${specifier}`, `${r!.id}::${specifier}`);
        }
        return id;
      }
      if (id === '/ember-vite-hmr/services/vite-hot-reload') {
        return this.resolve(
          'ember-vite-hmr/services/vite-hot-reload',
          path.resolve(process.cwd(), 'package.json'),
          meta,
        );
      }
    },
    async load(id: string) {
      if (id.includes('@ember-vite-hmr/setup-ember-hmr.js')) {
        return await readFile(
          path.resolve(__dirname, '..', 'setup-ember-hmr.js'),
          'utf8',
        );
      }
      if (id.startsWith(virtualPrefix)) {
        if (!server) {
          // During build, server is not available
          return null;
        }
        let [imp, specifier] = id
          .split('?')[0]!
          .slice(virtualPrefix.length, -'.gts'.length)
          .split('::');
        imp = imp!.replace('embroider_virtual', '@embroider/virtual');
        let filename = imp!;
        if (filename.includes('__vpc__')) {
          filename = filename.split('__vpc__')[0]!;
        }
        const res = await server.transformRequest(filename);
        const content = res?.code;

        const { filename: yieldSourceFilename, content: yieldSourceContent } =
          await resolveYieldSource(server, base, filename, content ?? '');

        const resId = await this.resolve(
          yieldSourceFilename,
          path.resolve(process.cwd(), 'package.json'),
        );
        // Strip any query string so the cache key matches the plain file path that
        // `hotUpdate` below receives when that template file is edited.
        const cacheKey = resId!.id.split('?')[0]!;
        const cached = getYieldsFromFile(cacheKey, yieldSourceContent ?? '');
        const yields = cached.yields;
        cached.modules.push(id);
        return getHotComponent(
          imp!,
          specifier!,
          [...yields]!.filter((y) => !!y),
        );
      }
    },
    transformIndexHtml(html) {
      if (process.env.EMBER_VITE_HMR_ENABLED !== 'true') {
        return html;
      }
      // this hook runs after vite's own html transform, so the configured
      // `base` has to be prefixed manually (it always ends with a slash)
      const fullPath = `${base}@ember-vite-hmr/setup-ember-hmr.js`;
      return [
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: `import "${fullPath}"`,
        },
      ];
    },
    handleHotUpdate(ctx) {
      if (!ctx.file.split('?')[0]!.endsWith('.hbs')) {
        return ctx.modules;
      }
      const otherModules = [];
      const pairedModule = ctx.modules.find((m) =>
        [...m.importers].find(
          (i) =>
            i.id!.startsWith('embroider_virtual') &&
            i.id!.endsWith('-embroider-pair-component'),
        ),
      );
      if (pairedModule) {
        const pairComponent = [...pairedModule.importers].find(
          (i) =>
            i.id!.startsWith('embroider_virtual') &&
            i.id!.endsWith('-embroider-pair-component'),
        );
        if (pairComponent) {
          const componentModule = [...pairComponent.clientImportedModules].find(
            (cim) =>
              cim.id!.split('?')[0]!.match(/\/component\.(js|ts|gjs|gts)/),
          );
          if (componentModule) {
            otherModules.push(componentModule);
          }
        }
      }
      return [...ctx.modules, ...otherModules];
    },
    async hotUpdate(options) {
      if (options.type === 'update' || options.type === 'create') {
        const id = options.file;
        const source = (await readFile(id)).toString();
        if (
          cachedYields[id] &&
          difference(
            cachedYields[id].yields,
            getYieldsFromFile(id, source, true).yields,
          ).length
        ) {
          for (const y of getYieldsFromFile(id, source).yields) {
            cachedYields[id].yields.add(y);
          }
          const modules = cachedYields[id].modules;
          delete cachedYields[id];
          for (const module of modules) {
            server.moduleGraph.onFileChange(module);
            let m = server.moduleGraph.getModuleById(module);
            if (m) {
              await server.reloadModule(m);
            }
          }
        }
      }
    },
    async transform(source, id) {
      if (process.env.EMBER_VITE_HMR_ENABLED !== 'true') {
        return source;
      }
      const resourcePath = normalizePath(id.split('?')[0]!);
      const supportedExt = ['.hbs', '.gjs', 'gts', '.js', '.ts'];
      if (!supportedExt.some((x) => resourcePath.endsWith(x))) {
        return source;
      }
      // Wire compat-modules HMR into the app entry, detected by the
      // compat-modules import it owns rather than its path.
      const compatModulesImport =
        !resourcePath.includes('node_modules') &&
        source.match(
          new RegExp(
            `import\\s+(\\w+)\\s+from\\s+['"]${compatModulesSpecifier}['"]`,
          ),
        );
      if (compatModulesImport) {
        const compatModules = compatModulesImport[1];
        source += `\n
              if (import.meta.hot) {
                let prevCompatModules = Object.assign({}, ${compatModules});
                import.meta.hot.accept('${compatModulesSpecifier}', (m) => {
                  for (const [name, module] of Object.entries(m.default)) {
                    ${compatModules}[name] = module;
                    if (name.includes('initializers') && prevCompatModules[name]?.default !== module.default) {
                      globalThis.location.reload();
                    }
                  }
                  prevCompatModules = m.default;
                });
              }`;
      }
      if (resourcePath.includes('ember-vite-hmr/virtual/components')) {
        return source;
      }

      if (resourcePath.includes('node_modules')) {
        return source;
      }

      // Add hot reload statements for tracked imports.
      //
      // lib/babel-plugin.ts's hotReplaceAst already computes this exact
      // metadata (importVar/bindings/importStatements) while babel processes
      // this same file earlier in the pipeline, and shares it via
      // hmrImportMetadataCache keyed by filename -- so the common case skips
      // re-parsing and re-traversing this file from scratch. Only fall back
      // to recovering it the slow way (parsing the already-babel-transformed
      // source and pulling the __hmr_import_metadata__ export back out of
      // it) when there's no cache entry, e.g. because this file's babel pass
      // didn't go through hotReplaceAst in this process, or a concurrent
      // babel pass for another file raced the cache write out (see that
      // cache's own doc comment).
      let importVar: string | null = null;
      let bindings: string[] = [];
      let importStatements: Array<{
        local: string;
        source: string;
        specifier: string;
      }> = [];

      const cached = hmrImportMetadataCache.get(resourcePath);
      if (cached) {
        importVar = cached.importVar;
        bindings = cached.bindings;
        importStatements = cached.importStatements;
      } else {
        const result = parseSync(source, {
          filename: resourcePath,
          ast: true,
          code: false,
          configFile: false,
          babelrc: false,
          plugins: [
            ['@babel/plugin-syntax-typescript', { isTSX: true }],
            ['@babel/plugin-proposal-decorators', { version: '2022-03' }],
          ],
        });

        if (result) {
          // First pass: Extract metadata
          traverse(result, {
            ExportNamedDeclaration(path: NodePath<{ declaration?: unknown }>) {
              const declaration = (
                path.node as {
                  declaration?: {
                    type?: string;
                    declarations?: Array<{
                      id?: { name?: string };
                      init?: unknown;
                    }>;
                  };
                }
              ).declaration;

              // Check if this is: export const __hmr_import_metadata__ = {...}
              if (
                declaration?.type === 'VariableDeclaration' &&
                declaration.declarations?.[0]?.id?.name ===
                  '__hmr_import_metadata__'
              ) {
                const init = declaration.declarations[0].init as {
                  type?: string;
                  properties?: Array<{
                    type?: string;
                    key?: { type?: string; name?: string };
                    value?: {
                      type?: string;
                      value?: string;
                      elements?: Array<{ type?: string; value?: string }>;
                    };
                  }>;
                };

                if (init?.type === 'ObjectExpression') {
                  // Extract importVar and bindings from the object
                  for (const prop of init.properties) {
                    if (
                      prop.type === 'ObjectProperty' &&
                      prop.key.type === 'Identifier'
                    ) {
                      if (
                        prop.key.name === 'importVar' &&
                        prop.value.type === 'StringLiteral'
                      ) {
                        importVar = prop.value.value;
                      } else if (
                        prop.key.name === 'bindings' &&
                        prop.value.type === 'ArrayExpression'
                      ) {
                        bindings = prop.value.elements
                          .filter(
                            (el: unknown) =>
                              (el as { type?: string })?.type ===
                              'StringLiteral',
                          )
                          .map(
                            (el: unknown) => (el as { value: string }).value,
                          );
                      }
                    }
                  }
                }
              }
            },
          });

          // Second pass: Find matching imports (only if we have bindings to match)
          if (importVar && bindings.length > 0) {
            traverse(result, {
              ImportDeclaration(path) {
                const importSource = path.node.source.value;

                for (const specifier of path.node.specifiers) {
                  const local = specifier.local.name;

                  if (bindings.includes(local)) {
                    let specifierName = 'default';

                    if (specifier.type === 'ImportDefaultSpecifier') {
                      specifierName = 'default';
                    } else if (specifier.type === 'ImportSpecifier') {
                      // For named imports, use the imported name
                      // Handle both Identifier and StringLiteral types
                      const imported = specifier.imported;
                      specifierName =
                        imported.type === 'Identifier'
                          ? imported.name
                          : imported.value;
                    } else if (specifier.type === 'ImportNamespaceSpecifier') {
                      specifierName = '*';
                    }

                    importStatements.push({
                      local,
                      source: importSource,
                      specifier: specifierName,
                    });
                  }
                }
              },
            });
          }
        }
      }

      // Process metadata if we found importVar (even with empty bindings)
      if (importVar) {
        // Generate hot reload code for each import (only if we have bindings)
        const hotReloadStatements: string[] = [];
        for (const imp of importStatements) {
          // Resolve the import to check if it's from node_modules
          const resolved = await this.resolve(imp.source, resourcePath, {});
          if (
            resolved?.id &&
            normalizePath(resolved.id).includes('node_modules')
          ) {
            // Skip node_modules imports
            continue;
          }

          const sourceId = imp.source.replace(
            /@embroider\/virtual/g,
            'embroider_virtual',
          );
          const virtualPath = `/ember-vite-hmr/virtual/component:${sourceId}::${imp.specifier}.gjs`;

          hotReloadStatements.push(`
  (async () => {
    const GlimmerComponent = (await import('@glimmer/component')).default;
    const { hasInternalComponentManager } = await import('@glimmer/manager');
    // Class-based Glimmer components are functions, detected the cheap way
    // via prototype chain. Template-only components (no backing class, e.g.
    // a bare \`<template>\` export) are plain objects instead, so they have to
    // be recognized by checking for a registered component manager - that
    // also keeps helpers/modifiers (which use separate manager registries)
    // out of this branch.
    const isComponent = typeof ${imp.local} === 'function'
      ? ${imp.local}.prototype instanceof GlimmerComponent
      : typeof ${imp.local} === 'object' && ${imp.local} !== null && hasInternalComponentManager(${imp.local});
    if (isComponent) {
      const c = await import('${virtualPath}');
      ${importVar}.${imp.local} = c.default;
      import.meta.hot.accept('${virtualPath}', (c) => {
        ${importVar}.${imp.local} = c['${imp.specifier}'];
      });
      import.meta.hot.accept('${imp.source}');
    }
  })();`);
        }

        // Always remove the metadata export
        source = source.replace(
          /export const __hmr_import_metadata__[^;]+;/,
          '',
        );

        // Add HMR code if we have any statements OR if we have bindings (even if all were skipped)
        if (hotReloadStatements.length > 0 || bindings.length > 0) {
          const hotReloadCode = `
if (import.meta.hot) {
${hotReloadStatements.join('\n')}
}`;
          source = source + hotReloadCode;
        }
      }

      const supportedPaths = ['routers', 'controllers', 'routes', 'templates'];
      const supportedFileNames = [
        'route.js',
        'route.ts',
        'route.gts',
        'route.gjs',
        'controller.js',
        'controller.ts',
      ];
      if (resourcePath.includes('/-components/')) {
        return source;
      }
      if (
        !supportedPaths.some((s) => resourcePath.includes(`/${s}/`)) &&
        !supportedFileNames.some((s) => resourcePath.endsWith(s))
      ) {
        return source;
      }
      if (
        supportedPaths.includes('templates') &&
        supportedPaths.includes('components')
      ) {
        return source;
      }
      return `${source}
  if (import.meta.hot && globalThis.emberHotReloadPlugin) {
      const result = globalThis.emberHotReloadPlugin.canAcceptNew(import.meta.url);
      result.then(() => {
        if (!result) {
          import.meta.hot.decline();
        } else {
          import.meta.hot.accept()
        }
      });
  }
  `;
    },
  };
}
