import { PluginObj } from '@babel/core';
import type * as BabelTypesNamespace from '@babel/types';
import type * as Babel from '@babel/core';
import {
  hotAstProcessor,
  finalizeTemplateImports,
  hmrImportMetadataCache,
  normalizeHmrCacheFilename,
} from './babel-plugin/template-imports.js';
import { renamePrivateClassMembers } from './babel-plugin/private-members.js';
import { transformServiceExport } from './babel-plugin/service-proxy.js';

export type {
  HmrImportStatement,
  HmrImportMetadata,
} from './babel-plugin/template-imports.js';

// `ember-vite-hmr/lib/babel-plugin` is a published subpath import (see
// test-app/babel.config.mjs), so this file's module path and its exports
// (this default export, and the `hotAstProcessor` / `hmrImportMetadataCache`
// / `normalizeHmrCacheFilename` re-exports below) have to keep resolving
// exactly as-is -- the actual logic lives in ./babel-plugin/*, split by
// concern:
//  - template-imports.ts: rewrites template references to imported
//    components/helpers/modifiers through a per-module tracked class, so
//    swapping which module a virtual HMR wrapper resolves to is visible to
//    templates (registered separately as an ember-template-compilation
//    transform via the `hotAstProcessor` export below), and shares the
//    computed import metadata with lib/hmr.ts via `hmrImportMetadataCache`.
//  - private-members.ts: rewrites every native `#private` class member the
//    app's own source declares to a plain, uniquely-named property, so it
//    reads/writes correctly through the service proxy below regardless of
//    what `this` is at the call site.
//  - service-proxy.ts: rewrites `export default class X extends Service`
//    into a generated HMR proxy class that swaps its delegate instance on
//    every accepted update.
export { hotAstProcessor, hmrImportMetadataCache, normalizeHmrCacheFilename };

export default function hotReplaceAst(babel: typeof Babel): PluginObj {
  return {
    name: 'a-hot-reload-imports',
    pre(file) {
      hotAstProcessor.reset();
      hotAstProcessor.meta.babelProgram = file.ast.program;
    },
    visitor: {
      // Runs on *every* class the app's own source defines, independent of
      // whether it's a service, a service's ancestor, or unrelated to the
      // HMR proxy machinery entirely -- see `renamePrivateClassMembers`'s
      // own doc comment for why this can't be scoped any tighter than that
      // without whole-program analysis. This also visits the `proxyClass`
      // (and, for an inline export, the `originalClass` copy)
      // `transformServiceExport` generates below -- harmless today only
      // because generated proxy classes never declare private members of
      // their own; if that ever changes, this visitor would rename them
      // too.
      Class(path, state) {
        if (process.env.EMBER_VITE_HMR_ENABLED !== 'true') {
          return;
        }
        if (state.filename?.includes('node_modules')) {
          return;
        }
        const programPath = path.findParent((p) =>
          p.isProgram(),
        ) as Babel.NodePath<BabelTypesNamespace.Program>;
        if (!programPath) {
          return;
        }
        renamePrivateClassMembers(babel, path, programPath);
      },
      ExportDefaultDeclaration(path, state) {
        if (process.env.EMBER_VITE_HMR_ENABLED !== 'true') {
          return;
        }
        if (state.filename?.includes('node_modules')) {
          return;
        }
        transformServiceExport(babel, path, state);
      },
      Program(path, state) {
        if (process.env.EMBER_VITE_HMR_ENABLED !== 'true') {
          return;
        }
        if (state.filename?.includes('node_modules')) {
          return;
        }
        finalizeTemplateImports(babel, path, state.filename);
      },
    },
  };
}
