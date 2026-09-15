import { PluginObj } from '@babel/core';
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

// Populated by hotReplaceAst's Program visitor below (once per file, per
// babel pass) and consumed by lib/hmr.ts's Vite `transform` hook, so that
// hook doesn't have to re-parse and re-traverse the same file from scratch
// just to recover metadata this babel pass already computed. Keyed by the
// file's path, normalized the same way on both sides (see
// normalizeHmrCacheFilename / lib/hmr.ts's normalizePath) since both run
// against the same on-disk file within the same Vite transform pipeline
// pass.
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

export default function hotReplaceAst(babel: typeof Babel): PluginObj {
  const t = babel.types;
  return {
    name: 'a-hot-reload-imports',
    pre(file) {
      hotAstProcessor.reset();
      hotAstProcessor.meta.babelProgram = file.ast.program;
    },
    visitor: {
      ExportDefaultDeclaration(path, state) {
        if (process.env.EMBER_VITE_HMR_ENABLED !== 'true') {
          return;
        }
        if (state.filename?.includes('node_modules')) {
          return;
        }
        // Check if this is a service file (normalize path for cross-platform compatibility)
        const normalizedFilename = state.filename?.replace(/\\/g, '/');
        if (!normalizedFilename?.includes('/services/')) {
          return;
        }

        const declaration = path.node.declaration;

        // Handle both inline class declaration and identifier reference
        let classDeclaration: BabelTypesNamespace.ClassDeclaration | null =
          null;
        let classIdentifier: BabelTypesNamespace.Identifier | null = null;

        if (declaration.type === 'ClassDeclaration' && declaration.id) {
          // Case 1: export default class MyService extends Service { ... }
          classDeclaration = declaration;
          classIdentifier = declaration.id;
        } else if (declaration.type === 'Identifier') {
          // Case 2: class MyService extends Service { ... } \n export default MyService;
          const binding = path.scope.getBinding(declaration.name);
          if (binding && binding.path.isClassDeclaration()) {
            classDeclaration = binding.path
              .node as BabelTypesNamespace.ClassDeclaration;
            classIdentifier = classDeclaration.id;
          }
        }

        if (!classDeclaration || !classIdentifier) {
          return;
        }

        if (classIdentifier.name.endsWith('HmrProxy')) {
          return;
        }

        // Check if it extends Service
        const superClass = classDeclaration.superClass;
        if (
          !superClass ||
          ((superClass.type !== 'Identifier' ||
            superClass.name !== 'Service') &&
            superClass.type !== 'MemberExpression')
        ) {
          return;
        }

        // Get the program path for ImportUtil
        const programPath = path.findParent((p) =>
          p.isProgram(),
        ) as Babel.NodePath<BabelTypesNamespace.Program>;
        if (!programPath) {
          return;
        }

        const util = new ImportUtil(babel, programPath);
        const tracked = util.import(
          programPath,
          '@glimmer/tracking',
          'tracked',
        );
        const Service = util.import(programPath, '@ember/service', 'default');

        const originalClassName = classIdentifier.name;
        const proxyClassName = `${originalClassName}HmrProxy`;

        // Keep the original class as-is, just remove it from export
        // We'll add it back as a non-exported class

        const babelTemplate = (babel as typeof import('@babel/core')).template;

        // The live proxy instance and the latest accepted implementation must
        // live on `import.meta.hot.data`, not in a module-scope `let`: Vite
        // guarantees that object (and only that object) survives across a
        // module's hot re-evaluations. A component's `@service` injection can
        // end up constructing the proxy against a *later* re-evaluation of
        // this module than the one whose `import.meta.hot.accept` closure
        // captured a module-scope variable — the closure and the constructor
        // would then silently operate on two disconnected variable bindings
        // (a duplicate-module symptom), and the HMR swap would never reach
        // the instance actually rendered.
        const ctorBody = babelTemplate.statements(
          `
            super(...args);
            this._owner = args[0];
            const Impl = (import.meta.hot && import.meta.hot.data._impl) || ${proxyClassName}.Impl;
            this._delegate = new Impl(this._owner);
            if (import.meta.hot) {
              import.meta.hot.data._proxy = this;
            }
            // Bound methods are cached per-delegate (not per-proxy) so identity
            // stays stable across repeated reads of the same delegate (e.g.
            // {{on "click" this.svc.handler}} comparing args by reference), while
            // naturally invalidating once a delegate is swapped out on HMR accept.
            const boundMethods = new WeakMap();
            return new Proxy(this, {
              get(target, prop, receiver) {
                if (prop === '_delegate') {
                  return target._delegate;
                }
                // A subclass of this service (see the Reflect.get fallback
                // below) may override a method the base delegate class also
                // defines. Since 'prop in delegate' walks the delegate's
                // *entire* prototype chain, it would match the base
                // implementation before the subclass's own override ever
                // gets a chance -- so look for an own property between
                // target's dynamic prototype and this proxy's own prototype
                // first, and prefer it over the delegate.
                let proto = Object.getPrototypeOf(target);
                while (proto && proto !== ${proxyClassName}.prototype) {
                  if (Object.prototype.hasOwnProperty.call(proto, prop)) {
                    return Reflect.get(target, prop, receiver);
                  }
                  proto = Object.getPrototypeOf(proto);
                }
                const delegate = target._delegate;
                // Methods invoked via normal member-call syntax (service.method())
                // bind 'this' to whatever object the property access happened on
                // -- the proxy, here -- not to the delegate. That breaks native
                // private fields, whose storage lives only on the concrete
                // delegate instance, so prototype methods are explicitly bound
                // to the delegate. Own-property function values (arrow-function
                // class fields, modifier()/helper() results, component classes,
                // etc.) must NOT be bound: they're either already lexically
                // bound to the delegate (arrow fields, since the delegate is
                // constructed via 'new Impl(owner)') or carry manager/identity
                // metadata attached to the exact function object via a WeakMap
                // (modifier()/helper()/setComponentManager) that bind() would
                // silently lose by returning a fresh function.
                if (prop in delegate) {
                  const value = delegate[prop];
                  if (
                    typeof value === 'function' &&
                    !Object.prototype.hasOwnProperty.call(delegate, prop)
                  ) {
                    let cache = boundMethods.get(delegate);
                    if (!cache) {
                      cache = new Map();
                      boundMethods.set(delegate, cache);
                    }
                    let bound = cache.get(prop);
                    if (!bound) {
                      bound = value.bind(delegate);
                      cache.set(prop, bound);
                    }
                    return bound;
                  }
                  return value;
                }
                // Not on the delegate: fall through to the proxy's own real
                // prototype chain, which covers methods declared on a subclass
                // of this service (the subclass never went through this babel
                // transform itself, since it doesn't extend Service directly).
                return Reflect.get(target, prop, receiver);
              },
              set(target, prop, value) {
                target._delegate[prop] = value;
                return true;
              },
              defineProperty(target, prop, descriptor) {
                // A subclass's own class fields are installed via
                // [[DefineOwnProperty]] against whatever 'this' super() returned
                // (this proxy), bypassing the 'set' trap entirely. Route them to
                // the delegate too, so subclass state lives alongside the rest
                // of the service's state instead of stranded on the proxy target.
                return Reflect.defineProperty(target._delegate, prop, descriptor);
              },
            });
          `,
        )() as BabelTypesNamespace.Statement[];

        const willDestroyBody = babelTemplate.statements(
          `
            super.willDestroy();
            this._delegate.willDestroy();
            if (import.meta.hot && import.meta.hot.data._proxy === this) {
              import.meta.hot.data._proxy = undefined;
            }
          `,
        )() as BabelTypesNamespace.Statement[];

        // Create the HMR proxy service class
        const proxyClass = t.classDeclaration(
          t.identifier(proxyClassName),
          Service,
          t.classBody([
            // static Impl = OriginalService (reference to the original class)
            t.classProperty(
              t.identifier('Impl'),
              t.identifier(originalClassName),
              null,
              null,
              false,
              true,
            ),
            // @tracked _delegate
            t.classProperty(
              t.identifier('_delegate'),
              null,
              null,
              [t.decorator(tracked)],
              false,
              false,
            ),
            t.classMethod(
              'constructor',
              t.identifier('constructor'),
              [t.restElement(t.identifier('args'))],
              t.blockStatement(ctorBody),
            ),
            t.classMethod(
              'method',
              t.identifier('willDestroy'),
              [],
              t.blockStatement(willDestroyBody),
            ),
          ]),
        );

        // For Case 1 (inline class), we need to keep the class as non-exported
        // For Case 2 (separate declaration), the class already exists, so we don't recreate it
        if (declaration.type === 'ClassDeclaration') {
          // Case 1: Inline class export - create a non-exported version
          const originalClass = t.classDeclaration(
            classIdentifier,
            classDeclaration.superClass,
            classDeclaration.body,
            classDeclaration.decorators || [],
          );

          // Replace the export with all the necessary declarations
          // IMPORTANT: Class must be declared BEFORE the proxy class that references it
          path.replaceWithMultiple([
            originalClass, // The original class (no longer exported) - MUST BE FIRST
            t.exportDefaultDeclaration(proxyClass), // Export the proxy class
          ]);
        } else {
          // Case 2: Separate declaration - class already exists, just replace the export
          path.replaceWithMultiple([
            t.exportDefaultDeclaration(proxyClass), // Export the proxy class
          ]);
        }

        // Add HMR code after the export using babel template
        if (programPath) {
          const hmrCode = `
            if (import.meta.hot) {
              import.meta.hot.accept((newModule) => {
                const NewImpl = newModule?.default?.Impl;
                if (!NewImpl) {
                  return;
                }

                // Remember the latest accepted implementation so a proxy
                // constructed *after* this update (its instantiation raced
                // behind the HMR swap) still picks up the new class instead
                // of the stale one captured at module-evaluation time.
                import.meta.hot.data._impl = NewImpl;

                const proxy = import.meta.hot.data._proxy;
                if (!proxy) {
                  // No instance has been created yet; the next construction
                  // will read import.meta.hot.data._impl above.
                  return;
                }

                const oldDelegate = proxy._delegate;
                const newDelegate = new NewImpl(proxy._owner);
                proxy._delegate = newDelegate;

                // Sync state from old to new while keeping new implementation defaults
                for (const key in oldDelegate) {
                  const descriptor =
                    Object.getOwnPropertyDescriptor(oldDelegate, key) ||
                    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(oldDelegate), key);
                  const hasOwnDefault = Object.prototype.hasOwnProperty.call(newDelegate, key);
                  const currentValue = newDelegate[key];
                  const previousValue = oldDelegate[key];

                  // Skip Service instances - they should not be synced
                  if (previousValue instanceof Service) {
                    continue;
                  }

                  // Skip function properties that the new implementation also
                  // declares (a fresh redefinition should win over the old
                  // one). But a function-valued property the new
                  // implementation *doesn't* declare at all isn't a stale
                  // redefinition -- it's state a subclass installed on the
                  // delegate directly (subclasses of this service never go
                  // through this transform themselves, since their
                  // superclass isn't literally named Service; their own
                  // class fields land on the delegate via the proxy's
                  // defineProperty trap instead). Dropping it here would
                  // silently break e.g. an arrow-function class field on a
                  // subclass across a base-class HMR swap.
                  if (typeof previousValue === 'function' && hasOwnDefault) {
                    continue;
                  }

                  const shouldSync =
                    !!descriptor &&
                    (descriptor.writable || descriptor.set || Object.prototype.hasOwnProperty.call(oldDelegate, key)) &&
                    (!hasOwnDefault || currentValue === previousValue);

                  if (shouldSync) {
                    try {
                      newDelegate[key] = previousValue;
                    } catch (e) {
                      // Skip non-writable properties
                    }
                  }
                }

                newDelegate._hmrAccepted?.(oldDelegate);

                if (oldDelegate.willDestroy) {
                  oldDelegate.willDestroy();
                }
              });
            }
          `;

          const template = (
            babel as typeof import('@babel/core')
          ).template.statements(hmrCode);
          (
            programPath as Babel.NodePath<BabelTypesNamespace.Program>
          ).pushContainer('body', template());
        }
      },
      Program(path, state) {
        if (process.env.EMBER_VITE_HMR_ENABLED !== 'true') {
          return;
        }
        if (state.filename?.includes('node_modules')) {
          return;
        }
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
            (e: BabelTypesNamespace.Statement) =>
              e.type === 'ImportDeclaration',
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
        // in-process cache (see hmrImportMetadataCache's own comment). Only
        // trust `hotAstProcessor.meta` here if it's still the same Program
        // node `pre()` set it up for -- if a concurrent babel pass for a
        // *different* file reset the shared singleton in between (see
        // hmrImportMetadataCache's doc comment), `meta.babelProgram` would
        // point at that other file's AST (or be undefined) instead of
        // `path.node`, and this file's data must not be cached under this
        // file's key.
        if (state.filename && hotAstProcessor.meta.babelProgram === path.node) {
          hmrImportMetadataCache.set(
            normalizeHmrCacheFilename(state.filename),
            {
              importVar: hotAstProcessor.meta.importVar,
              bindings,
              importStatements: computeImportStatements(
                path.node.body,
                hotAstProcessor.meta.importBindings,
              ),
            },
          );
        }

        path.scope.crawl();
      },
    },
  };
}
