import path from 'path';
import { fileURLToPath } from 'url';
import { Plugin, ViteDevServer } from 'vite';
import { readFile } from 'fs/promises';
import { hmrImportMetadataCache } from './babel-plugin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Embroider's resolver registry. It's the binding the app entry's HMR hook
// mutates, so we use it to locate that entry. Embroider keeps this as an
// internal literal (not a public export), so we mirror the string here.
const compatModulesSpecifier = '@embroider/virtual/compat-modules';

export const hmrRuntimeId = 'virtual:ember-vite-hmr-runtime';
const resolvedRuntimeId = '\0' + hmrRuntimeId;

// This runs in the browser.
// It has no imports on purpose: a virtual module has no location on disk,
// so Embroider's resolver has nothing to resolve `@glimmer/tracking` against.
// The app modules that call `define` can import `tracked` normally and pass
// it in.
//
// `byValue` lets an old reference to a component class find its current
// registry entry, so modules holding stale bindings still serve the newest
// version.
//
// `consumed` lets a self-accepting module that nobody rendered through
// fall back to `invalidate()` rather than silently doing nothing.
//
// `tracked` is called as a function (not a decorator syntax), so the runtime
// doesn't depend on the app's Babel decorator config.
const runtimeSource = `
const entries = new Map();
const byValue = new WeakMap();

function isRef(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

function makeEntry(tracked, value) {
  class Entry {}
  const desc = tracked(Entry.prototype, 'current', { configurable: true, enumerable: true, writable: true, initializer: null });
  Object.defineProperty(Entry.prototype, 'current', desc);
  const entry = new Entry();
  entry.current = value;
  entry.consumed = false;
  return entry;
}

export function register(id, value, tracked) {
  let entry = entries.get(id);
  if (entry) {
    entry.current = value;
  } else {
    entry = makeEntry(tracked, value);
    entries.set(id, entry);
  }
  if (isRef(value)) {
    byValue.set(value, entry);
  }
}

export function current(value) {
  const entry = isRef(value) ? byValue.get(value) : undefined;
  if (!entry) {
    return value;
  }
  entry.consumed = true;
  return entry.current;
}

export function used(id) {
  return Boolean(entries.get(id)?.consumed);
}
`;

// `enforce: 'pre'` makes this run before Embroider's resolver, which would
// otherwise try to resolve the virtual id as a package and fail.
// `apply: 'serve'` keeps it out of production builds entirely.
export function hmrRuntime(): Plugin {
  return {
    name: 'ember-vite-hmr-runtime',
    enforce: 'pre',
    apply: 'serve',
    resolveId(source) {
      if (source === hmrRuntimeId) {
        return resolvedRuntimeId;
      }
    },
    load(id) {
      if (id === resolvedRuntimeId) {
        return runtimeSource;
      }
    },
  };
}

// Helper function to normalize paths consistently across platforms
function normalizePath(inputPath: string): string {
  return inputPath.replace(/\\/g, '/');
}

export function hmr(enableViteHmrForModes: string[] = ['development']): Plugin {
  let base = '/';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let server: ViteDevServer;
  return {
    name: 'hmr-plugin',
    enforce: 'post',
    config(config, env) {
      if (!enableViteHmrForModes.includes(env.mode)) {
        return;
      }
      // With `optimizeDeps.noDiscovery: true`, Vite never scans the app's own
      // source, so nothing else pulls these glimmer subpaths into the optimizer.
      // Forcing them into `include` then creates a second, separately pre-bundled
      // copy of the glimmer VM alongside the unoptimized one the rest of the
      // (unscanned) app actually uses, leading to "The global context for Glimmer
      // VM was not set" (#554). Skip entirely in that mode.
      if (config.optimizeDeps?.noDiscovery) {
        return;
      }
      return {
        optimizeDeps: {
          include: [
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
        // Fall back to extracting metadata from the __hmr_import_metadata__
        // export the babel plugin emits into the source.
        const metaMatch = source.match(
          /export const __hmr_import_metadata__ = (\{[\s\S]*?\});/,
        );
        if (metaMatch) {
          try {
            // eslint-disable-next-line no-new-func
            const meta = new Function(`return ${metaMatch[1]}`)() as {
              importVar: string;
              bindings: string[];
            };
            importVar = meta.importVar;
            bindings = meta.bindings ?? [];
          } catch {
            // unparseable metadata — skip
          }
        }

        // Recover importStatements by scanning the source for each binding
        if (importVar && bindings.length > 0) {
          for (const binding of bindings) {
            const importMatch = source.match(
              new RegExp(
                `import\\s+(?:(${binding})|(\\{[^}]*\\b${binding}\\b[^}]*\\})|\\*\\s+as\\s+(${binding}))\\s+from\\s+['"]([^'"]+)['"]`,
              ),
            );
            if (importMatch) {
              const src = importMatch[4]!;
              let specifier = 'default';
              if (importMatch[2]) {
                // named import — find alias or name
                const namedMatch = importMatch[2].match(
                  new RegExp(`(\\w+)\\s+as\\s+${binding}|${binding}`),
                );
                specifier = namedMatch?.[1] ?? binding;
              } else if (importMatch[3]) {
                specifier = '*';
              }
              importStatements.push({ local: binding, source: src, specifier });
            }
          }
        }
      }

      // Process metadata if we found importVar (even with empty bindings)
      if (importVar) {
        const hotReloadStatements: string[] = [];
        const fileId = JSON.stringify(resourcePath);

        for (const imp of importStatements) {
          // Resolve the import to check if it's from node_modules
          const resolved = await this.resolve(imp.source, resourcePath, {});
          if (
            resolved?.id &&
            normalizePath(resolved.id).includes('node_modules')
          ) {
            continue;
          }

          // Each imported binding self-accepts: when this module reloads,
          // update the tracked cell in the runtime registry so Glimmer
          // re-renders any template that read through it.
          hotReloadStatements.push(`
  (async () => {
    const { register: ember_vite_hmr_register, used: ember_vite_hmr_used } = await import(${JSON.stringify(hmrRuntimeId)});
    const { tracked: ember_vite_hmr_tracked } = await import('@glimmer/tracking');
    ember_vite_hmr_register(${fileId} + ':' + ${JSON.stringify(imp.local)}, ${imp.local}, ember_vite_hmr_tracked);
    import.meta.hot.accept(${JSON.stringify(imp.source)}, (m) => {
      if (m) {
        const newVal = m[${JSON.stringify(imp.specifier === 'default' ? 'default' : imp.specifier)}];
        ${importVar}.${imp.local} = newVal;
        ember_vite_hmr_register(${fileId} + ':' + ${JSON.stringify(imp.local)}, newVal, ember_vite_hmr_tracked);
      } else if (!ember_vite_hmr_used(${fileId} + ':' + ${JSON.stringify(imp.local)})) {
        import.meta.hot.invalidate('nothing rendered ${imp.local} through the HMR runtime');
      }
    });
  })();`);
        }

        // Always remove the metadata export
        source = source.replace(
          /export const __hmr_import_metadata__[^;]+;/,
          '',
        );

        if (hotReloadStatements.length > 0) {
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
