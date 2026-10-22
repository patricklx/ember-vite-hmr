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
const entries = new WeakMap();

// Per-class FIFO queues of live component instances, used to pair old instances
// (being destroyed by an HMR swap) with the new instances that replace them.
// Keyed by the NEW class (the replacement). Cleared at update() time so that
// instances created by normal user-flow navigation before the swap are never
// in the queue — only instances created after the swap callback fires.
const liveInstanceQueues = new WeakMap();

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

// Register value for the first time. No-op if already registered.
export function register(value, tracked) {
  if (!isRef(value)) return;
  if (!entries.has(value)) {
    entries.set(value, makeEntry(tracked, value));
  }
}

// Re-point an existing entry from oldValue to newValue.
// Also registers newValue under the same entry so future current() calls
// on newValue resolve to whatever is current at that point.
//
// Clearing liveInstanceQueues[newValue] here is the key to correctness for
// syncState across user-flow create/destroy cycles. Any instances of newValue
// created and destroyed by normal navigation *before* this swap happened are
// stale. By resetting the queue at swap time, only instances created *after*
// this update() call (the replacement instances Glimmer is about to create)
// are eligible to receive state from the old instances being torn down.
export function update(oldValue, newValue) {
  if (!isRef(oldValue)) return;
  const entry = entries.get(oldValue);
  if (entry) {
    entry.current = newValue;
    if (isRef(newValue)) {
      entries.set(newValue, entry);
      // Clear the queue for newValue so only instances created after this
      // swap are paired with old instances being torn down.
      liveInstanceQueues.delete(newValue);
    }
    // oldValue is being retired — it will never be the target of a future
    // dequeueInstance() call, so any queued instances for it are now stale.
    liveInstanceQueues.delete(oldValue);
  }
}

export function current(value) {
  if (!isRef(value)) return value;
  const entry = entries.get(value);
  if (!entry) return value;
  entry.consumed = true;
  return entry.current;
}

export function used(value) {
  if (!isRef(value)) return false;
  return Boolean(entries.get(value)?.consumed);
}

// Returns true if value has been registered with the HMR runtime.
// Used by setup-hmr-manager.ts to skip non-HMR components when building
// the liveInstances queue so stale entries don't corrupt later HMR swaps.
export function isHmrClass(value) {
  return isRef(value) && entries.has(value);
}

// Called from setup-hmr-manager.ts's create() hook for each new HMR-registered
// component instance. Appends to the per-class queue in DOM (creation) order.
export function enqueueInstance(klass, instance) {
  if (!isRef(klass)) return;
  const q = liveInstanceQueues.get(klass);
  if (q) {
    q.push(instance);
  } else {
    liveInstanceQueues.set(klass, [instance]);
  }
}

// Called from setup-hmr-manager.ts's willDestroy hook. Returns and removes the
// oldest queued instance for klass (FIFO = DOM order), or null if none.
export function dequeueInstance(klass) {
  if (!isRef(klass)) return null;
  const q = liveInstanceQueues.get(klass);
  if (!q || q.length === 0) return null;
  const instance = q.shift();
  if (q.length === 0) liveInstanceQueues.delete(klass);
  return instance ?? null;
}

// Called from setup-hmr-manager.ts's willDestroy hook when no HMR swap is in
// progress (normal navigation destroy). Removes this specific instance from the
// queue so destroyed instances don't accumulate indefinitely when a timer
// mounts/unmounts the same component repeatedly between saves.
export function removeInstance(klass, instance) {
  if (!isRef(klass)) return;
  const q = liveInstanceQueues.get(klass);
  if (!q) return;
  const idx = q.indexOf(instance);
  if (idx !== -1) q.splice(idx, 1);
  if (q.length === 0) liveInstanceQueues.delete(klass);
}

// Expose helpers on the global so setup-hmr-manager.ts's synchronous
// initialize() can call them without a dynamic import.
globalThis.__ember_vite_hmr = { current, isHmrClass, enqueueInstance, dequeueInstance, removeInstance };
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

export function hmr(enableViteHmrForModes: string[] = ['development']): Plugin[] {
  let base = '/';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let server: ViteDevServer;
  const mainPlugin: Plugin = {
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
      const file = ctx.file.split('?')[0]!;
      const otherModules = [];

      // ── .hbs pair-component wiring (unchanged) ───────────────────────────
      if (file.endsWith('.hbs')) {
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
      }

      // ── subclass propagation ──────────────────────────────────────────────
      // When a component file (e.g. block-base.gts) self-accepts, Vite stops
      // propagation before any subclass module (e.g. block-child.ts extends
      // BlockBase) can be notified. The subclass's importer (e.g. equipment.gts)
      // therefore never fires its accept(block-child, cb) callback, so
      // template__imports__.BlockChild keeps pointing at the old class with
      // the old template.
      //
      // Fix: for every component file that changed, walk its direct importers
      // in Vite's module graph. Any importer that is itself a component file
      // under /components/ is a potential subclass — add it to the update set
      // so Vite re-evaluates it too. That re-evaluation runs its own
      // self-accept callback (update(OldChild, NewChild)) and causes the
      // parent template's accept(block-child, cb) to fire, swapping in the new
      // subclass and its newly-inherited template.
      // Subclass propagation only applies to files under /components/ — route
      // templates (.gts under /templates/) import components but are not
      // subclasses of them. Including templates would force Vite to re-evaluate
      // equipment.gts when resource-holder.gts changes, breaking the existing
      // accept(dep, cb) wiring that already handles that case correctly.
      const isComponentFile = (p: string) =>
        !p.includes('node_modules') &&
        !p.includes('/-components/') &&
        p.includes('/components/') &&
        (p.endsWith('.gjs') ||
          p.endsWith('.gts') ||
          p.endsWith('.ts') ||
          p.endsWith('.js'));

      if (isComponentFile(file)) {
        for (const mod of ctx.modules) {
          for (const importer of mod.importers) {
            const importerId = normalizePath(importer.id?.split('?')[0] ?? '');
            if (
              isComponentFile(importerId) &&
              !ctx.modules.some((m) => m.id === importer.id) &&
              !otherModules.includes(importer)
            ) {
              otherModules.push(importer);
            }
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

        for (const imp of importStatements) {
          // Resolve the import to check if it's from node_modules
          const resolved = await this.resolve(imp.source, resourcePath, {});
          if (
            resolved?.id &&
            normalizePath(resolved.id).includes('node_modules')
          ) {
            continue;
          }

          // Each imported binding is already a local variable in scope thanks
          // to its import statement. Register it by value on first load so
          // `current(binding)` (called by the template__imports__ getter) has
          // an entry to read from. When the dep module reloads, update() sets
          // entry.current = newVal — the getter re-reads it, invalidating only
          // the scope that contains the getter call, not the parent scope.
          // No assignment to template__imports__.X needed: the getter handles it.
          hotReloadStatements.push(`
  (async () => {
    const { register: ember_vite_hmr_register, update: ember_vite_hmr_update, used: ember_vite_hmr_used } = await import(${JSON.stringify(hmrRuntimeId)});
    const { tracked: ember_vite_hmr_tracked } = await import('@glimmer/tracking');
    ember_vite_hmr_register(${imp.local}, ember_vite_hmr_tracked);
    import.meta.hot.accept(${JSON.stringify(imp.source)}, (m) => {
      if (m) {
        const newVal = m[${JSON.stringify(imp.specifier === 'default' ? 'default' : imp.specifier)}];
        ember_vite_hmr_update(${imp.local}, newVal);
      } else if (!ember_vite_hmr_used(${imp.local})) {
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

        // Do NOT add a self-accept in the importVar block.
        //
        // When module A imports module B, and B's template__imports__ class is in
        // A's scope, A must be notified when B changes (so A's accept callback can
        // swap in the new B class via template__imports__.B = newB). If B were to
        // self-accept, Vite would stop propagation before A's callback fires — A's
        // template__imports__ would never be updated, and Glimmer would never
        // re-render. The same applies to route templates: they rely on Ember's
        // canAcceptNew mechanism (added below), which self-accept would bypass.
        //
        // Components without importVar (no template imports) get a self-accept in
        // the section below, after the supportedPaths check.
        const hotReloadCode = hotReloadStatements.length > 0
          ? `\nif (import.meta.hot) {\n${hotReloadStatements.join('\n')}\n}`
          : '';
        source = source + hotReloadCode;
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
        // Component files (including template-less .ts/.js ones that just extend
        // another component) that have no cross-component imports need a
        // self-accept boundary so edits to them don't propagate up to a full
        // page reload.  Restrict plain .ts/.js to paths under /components/ to
        // avoid accidentally self-accepting services, utilities, adapters, etc.
        const isComponentFile =
          resourcePath.endsWith('.gjs') ||
          resourcePath.endsWith('.gts') ||
          ((resourcePath.endsWith('.ts') || resourcePath.endsWith('.js')) &&
            resourcePath.includes('/components/'));
        if (isComponentFile && !importVar) {
          // Self-accept with a callback that updates the tracked-cell registry
          // so Glimmer re-renders and swaps in the new class. This handles
          // edits to the component's own class (new method, changed @tracked
          // property, etc.) — without it, a bare accept() would silently
          // discard the new class and leave the running instance on the old one.
          //
          // Only do this when there is no importVar (no template imports of
          // other components). When importVar is present, the component's own
          // importer already has an accept(dep, cb) that fires when this file
          // changes — adding a self-accept here would stop Vite's propagation
          // before that callback can fire, breaking the re-render. The same
          // applies to re-export barrels: a self-accept on my-button.ts stops
          // Vite walking up to index.ts's importer, silencing the accept
          // callback that updates template__imports__.
          //
          // The babel plugin rewrites `export default <expr>` into
          // `const __hmr_default__ = <expr>; export { __hmr_default__ as default }`
          // giving us a stable local variable to register by value.
          // hot.data.default carries the old value across self-accept
          // re-evaluations so update() can find the existing entry.
          return `${source}
if (import.meta.hot) {
  (async () => {
    const { register: ember_vite_hmr_register, update: ember_vite_hmr_update, used: ember_vite_hmr_used } = await import(${JSON.stringify(hmrRuntimeId)});
    const { tracked: ember_vite_hmr_tracked } = await import('@glimmer/tracking');
    const _hmr_prev = import.meta.hot.data.default;
    import.meta.hot.data.default = __hmr_default__;
    if (_hmr_prev) {
      ember_vite_hmr_update(_hmr_prev, __hmr_default__);
    }
    ember_vite_hmr_register(__hmr_default__, ember_vite_hmr_tracked);
    import.meta.hot.accept((m) => {
      if (m && !ember_vite_hmr_used(import.meta.hot.data.default)) {
        import.meta.hot.invalidate('nothing rendered this component through the HMR runtime');
      }
    });
  })();
}
`;
        }
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
  return [hmrRuntime(), mainPlugin];
}
