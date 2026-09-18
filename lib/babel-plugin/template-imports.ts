import type * as BabelTypesNamespace from '@babel/types';
import { Program } from '@babel/types';
import type * as Babel from '@babel/core';
import * as glimmer from '@glimmer/syntax';
import { ASTv1, NodeVisitor, WalkerPath } from '@glimmer/syntax';
import { ImportUtil } from 'babel-import-util';

interface ASTPluginEnvironment {
  locals: string[];
  filename: string;
}

export interface HmrImportStatement {
  local: string;
  source: string;
  specifier: string;
}

export interface HmrImportMetadata {
  importVar: string;
  bindings: string[];
  importStatements: HmrImportStatement[];
}

// Populated by finalizeTemplateImports below (once per file, per babel
// pass) and consumed by lib/hmr.ts's Vite `transform` hook, so that hook
// doesn't have to re-parse and re-traverse the same file from scratch just
// to recover metadata this babel pass already computed. Keyed by the file's
// path, normalized the same way on both sides (see normalizeHmrCacheFilename
// / lib/hmr.ts's normalizePath) since both run against the same on-disk
// file within the same Vite transform pipeline pass.
//
// This assumes babel never truly interleaves two files' Program visitors in
// a way that corrupts a single file's own derived data -- see the
// `hotAstProcessor.meta.babelProgram === path.node` guard at the write site
// below, which detects (and skips caching for) the case where a concurrent
// babel pass for a *different* file has reset the shared `hotAstProcessor`
// singleton in between. On any doubt, lib/hmr.ts falls back to its own
// from-source parse, which is always correct, just slower.
export const hmrImportMetadataCache = new Map<string, HmrImportMetadata>();

export function normalizeHmrCacheFilename(filename: string): string {
  return filename.split('?')[0]!.replace(/\\/g, '/');
}

function computeImportStatements(
  programBody: BabelTypesNamespace.Statement[],
  bindings: Set<string>,
): HmrImportStatement[] {
  const importStatements: HmrImportStatement[] = [];
  for (const statement of programBody) {
    if (statement.type !== 'ImportDeclaration') continue;
    for (const specifier of statement.specifiers) {
      const local = specifier.local.name;
      if (!bindings.has(local)) continue;
      let specifierName = 'default';
      if (specifier.type === 'ImportSpecifier') {
        const imported = specifier.imported;
        specifierName =
          imported.type === 'Identifier' ? imported.name : imported.value;
      } else if (specifier.type === 'ImportNamespaceSpecifier') {
        specifierName = '*';
      }
      importStatements.push({
        local,
        source: statement.source.value,
        specifier: specifierName,
      });
    }
  }
  return importStatements;
}

// Rewrites `<Foo />`/`{{foo}}`/`(helper "foo")`-style template references to
// a statically imported binding through a per-module `template__imports__`
// class instance instead, so swapping which module a virtual HMR wrapper
// resolves to (see lib/hmr.ts's `transform` hook) is visible to templates
// without re-evaluating the whole module. `transform` below is registered
// as an `ember-template-compilation` transform (see test-app/babel.config.mjs
// and tests/babel-plugin.test.js), separate from -- and running before --
// the js-level `hotReplaceAst` babel plugin in ../babel-plugin.ts, which is
// why the bookkeeping this class accumulates (`meta.importBindings` etc.) is
// read back later by that plugin's `Program` visitor (see
// `finalizeTemplateImports` below) to actually emit the `template__imports__`
// class declaration.
class HotAstProcessor {
  options = {
    itsStatic: false,
  };
  counter = 0;
  meta = {
    locals: new Set<string>(),
    importVar: null,
    babelProgram: undefined,
    importBindings: new Set<string>(),
  } as {
    locals: Set<string>;
    importVar: string | null;
    importBindings: Set<string>;
    babelProgram?: Program;
  };
  didCreateImportClass: boolean = false;

  constructor() {
    this.transform = this.transform.bind(this);
  }

  reset() {
    this.meta.importVar = null;
    this.meta.babelProgram = undefined;
    this.meta.importBindings = new Set<string>();
  }

  transform(env: ASTPluginEnvironment): { visitor: Record<string, unknown> } {
    if (process.env.EMBER_VITE_HMR_ENABLED !== 'true') {
      return {
        visitor: {},
      };
    }
    if (env.filename?.includes('node_modules')) {
      return {
        visitor: {},
      };
    }
    const meta = this.meta as Required<typeof this.meta>;
    const importVar = (
      env as unknown as {
        meta: {
          jsutils: {
            bindExpression: (
              expr: string,
              ctx: null,
              opts: { nameHint: string },
            ) => string;
          };
        };
      }
    ).meta.jsutils.bindExpression(meta.importVar || 'null', null, {
      nameHint: 'template__imports__',
    });
    meta.importVar = meta.importVar || importVar;
    return {
      visitor: {
        ...this.buildVisitor({
          importVar,
          importBindings: meta.importBindings,
          babelProgram: meta.babelProgram,
        }),
      },
    };
  }

  buildVisitor({
    importVar,
    importBindings,
    babelProgram,
  }: {
    importVar: string;
    importBindings: Set<string>;
    babelProgram: Program;
  }): NodeVisitor {
    const findImport = function findImport(specifier: string) {
      return babelProgram.body.find(
        (b) =>
          b.type === 'ImportDeclaration' &&
          b.specifiers.some((s) => s.local.name === specifier),
      );
    };

    const findBlockParams = function (
      expression: string,
      p: WalkerPath<
        | ASTv1.BlockStatement
        | ASTv1.Block
        | ASTv1.ElementNode
        | ASTv1.PathExpression
      >,
    ): boolean {
      if ((p.node as { type?: string }).type === 'Template') {
        return false;
      }
      if (
        p.node &&
        p.node.type === 'BlockStatement' &&
        p.node.program.blockParams.includes(expression)
      ) {
        return true;
      }
      const node = p.node as { blockParams?: string[] };
      if (node && node.blockParams && node.blockParams.includes(expression)) {
        return true;
      }
      if (!p.parent) return false;
      return findBlockParams(
        expression,
        p.parent as WalkerPath<
          | ASTv1.BlockStatement
          | ASTv1.Block
          | ASTv1.ElementNode
          | ASTv1.PathExpression
        >,
      );
    };
    const visitor: NodeVisitor = {
      PathExpression: (node, p) => {
        if (
          (p.parentNode?.type === 'SubExpression' ||
            p.parentNode?.type === 'MustacheStatement') &&
          p.parentNode.params.includes(node)
        ) {
          return;
        }
        const original = node.original.split('.')[0]!;
        if (original === 'this') return;
        if (original.startsWith('@')) return;
        if (original === 'block') return;
        if (original.startsWith('this.')) return;
        if (findBlockParams(original, p)) return;
        if (
          node.original === 'helper' ||
          node.original === 'component' ||
          node.original === 'modifier'
        ) {
          // node.original;
          const parent = p.parentNode as ASTv1.MustacheStatement;
          if (
            typeof (parent.params[0] as { original?: string }).original !==
            'string'
          ) {
            return;
          }
          const original = (
            parent.params[0] as ASTv1.StringLiteral
          ).original.split('.')[0];
          if (original && findBlockParams(original, p)) return;
          if (original?.includes('.')) return;
          if (!original) return;
          if (findImport(original)) {
            const param = glimmer.builders.path(`${importVar}.${original}`);
            parent.params.splice(0, 1, param);
            importBindings.add(original);
          }
          return;
        }
        if (importVar) {
          if (findImport(node.original)) {
            node.original = `${importVar}.${node.original}`;
            node.parts = node.original.split('.');
            importBindings.add(original);
          }
          return;
        }
      },
      ElementNode: (
        element: ASTv1.ElementNode,
        p: WalkerPath<ASTv1.ElementNode>,
      ) => {
        const original = element.tag.split('.')[0]!;
        if (findBlockParams(original, p)) return;
        if (importVar) {
          if (findImport(original)) {
            element.tag = `${importVar}.${original}`;
            p.node.tag = element.tag;
            importBindings.add(original);
          }
          return;
        }
      },
    };
    return visitor;
  }
}

export const hotAstProcessor = new HotAstProcessor();

// Emits the `template__imports__` class the templates rewritten by
// `HotAstProcessor.transform` above reference, once per module -- run from
// the js babel plugin's own `Program` visitor (not `HotAstProcessor` itself)
// since it needs `ImportUtil`/babel `types` to generate js AST, whereas the
// processor above only ever produces hbs AST.
export function finalizeTemplateImports(
  babel: typeof Babel,
  path: Babel.NodePath<BabelTypesNamespace.Program>,
  filename: string | undefined,
): void {
  const t = babel.types;
  if (
    !hotAstProcessor.meta.importVar ||
    hotAstProcessor.meta.importBindings.size === 0
  ) {
    return;
  }
  const util = new ImportUtil(babel, path);
  const tracked = util.import(path, '@glimmer/tracking', 'tracked');
  util.import(path, '@glimmer/component', 'default');
  const klass = t.classExpression(
    path.scope.generateUidIdentifier('Imports'),
    null,
    t.classBody([]),
  );
  const bindings = [...hotAstProcessor.meta.importBindings].sort();
  for (const local of bindings) {
    klass.body.body.push(
      t.classProperty(t.identifier(local), t.identifier(local), null, [
        t.decorator(tracked),
      ]),
    );
  }

  const newExp = t.newExpression(klass, []);
  const assign = t.assignmentExpression(
    '=',
    t.identifier(hotAstProcessor.meta.importVar),
    newExp,
  );

  const varDeclaration =
    path.node.body.findIndex(
      (e: BabelTypesNamespace.Statement) =>
        e.type === 'VariableDeclaration' &&
        (e.declarations[0]!.id as BabelTypesNamespace.Identifier).name ===
          hotAstProcessor.meta.importVar,
    ) + 1;
  const lastImportIndex =
    (path.node.body as BabelTypesNamespace.Statement[]).findLastIndex(
      (e: BabelTypesNamespace.Statement) => e.type === 'ImportDeclaration',
    ) + 1;

  path.node.body.splice(
    Math.max(varDeclaration, lastImportIndex),
    0,
    t.expressionStatement(assign),
  );

  // Export metadata about tracked imports for hmr.ts to use
  const importMetadata = t.variableDeclaration('const', [
    t.variableDeclarator(
      t.identifier('__hmr_import_metadata__'),
      t.objectExpression([
        t.objectProperty(
          t.identifier('importVar'),
          t.stringLiteral(hotAstProcessor.meta.importVar),
        ),
        t.objectProperty(
          t.identifier('bindings'),
          t.arrayExpression(bindings.map((b) => t.stringLiteral(b))),
        ),
      ]),
    ),
  ]);

  const exportMetadata = t.exportNamedDeclaration(importMetadata, []);
  path.node.body.push(exportMetadata);

  // Share the metadata just computed above with lib/hmr.ts via the
  // in-process cache (see hmrImportMetadataCache's own comment). Only trust
  // `hotAstProcessor.meta` here if it's still the same Program node `pre()`
  // set it up for -- if a concurrent babel pass for a *different* file
  // reset the shared singleton in between (see hmrImportMetadataCache's doc
  // comment), `meta.babelProgram` would point at that other file's AST (or
  // be undefined) instead of `path.node`, and this file's data must not be
  // cached under this file's key.
  if (filename && hotAstProcessor.meta.babelProgram === path.node) {
    hmrImportMetadataCache.set(normalizeHmrCacheFilename(filename), {
      importVar: hotAstProcessor.meta.importVar,
      bindings,
      importStatements: computeImportStatements(
        path.node.body,
        hotAstProcessor.meta.importBindings,
      ),
    });
  }

  path.scope.crawl();
}
