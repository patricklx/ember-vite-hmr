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
        const implVarName = `_${originalClassName}Impl`;
        const proxyVarName = `_${originalClassName}Proxy`;

        // Keep the original class as-is, just remove it from export
        // We'll add it back as a non-exported class

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
            // @tracked _delegate = new _OriginalServiceImpl()
            t.classProperty(
              t.identifier('_delegate'),
              t.newExpression(t.identifier(implVarName), []),
              null,
              [t.decorator(tracked)],
              false,
              false,
            ),
            // constructor
            t.classMethod(
              'constructor',
              t.identifier('constructor'),
              [t.restElement(t.identifier('args'))],
              t.blockStatement([
                t.expressionStatement(
                  t.callExpression(t.super(), [
                    t.spreadElement(t.identifier('args')),
                  ]),
                ),
                t.ifStatement(
                  t.unaryExpression('!', t.identifier(proxyVarName)),
                  t.blockStatement([
                    t.expressionStatement(
                      t.assignmentExpression(
                        '=',
                        t.identifier(proxyVarName),
                        t.thisExpression(),
                      ),
                    ),
                  ]),
                ),
                t.returnStatement(
                  t.newExpression(t.identifier('Proxy'), [
                    t.thisExpression(),
                    t.objectExpression([
                      t.objectMethod(
                        'method',
                        t.identifier('get'),
                        [t.identifier('target'), t.identifier('prop')],
                        t.blockStatement([
                          t.ifStatement(
                            t.binaryExpression(
                              '===',
                              t.identifier('prop'),
                              t.stringLiteral('_delegate'),
                            ),
                            t.returnStatement(
                              t.memberExpression(
                                t.identifier('target'),
                                t.identifier('_delegate'),
                              ),
                            ),
                          ),
                          t.returnStatement(
                            t.memberExpression(
                              t.memberExpression(
                                t.identifier('target'),
                                t.identifier('_delegate'),
                              ),
                              t.identifier('prop'),
                              true,
                            ),
                          ),
                        ]),
                      ),
                      t.objectMethod(
                        'method',
                        t.identifier('set'),
                        [
                          t.identifier('target'),
                          t.identifier('prop'),
                          t.identifier('value'),
                        ],
                        t.blockStatement([
                          t.expressionStatement(
                            t.assignmentExpression(
                              '=',
                              t.memberExpression(
                                t.memberExpression(
                                  t.identifier('target'),
                                  t.identifier('_delegate'),
                                ),
                                t.identifier('prop'),
                                true,
                              ),
                              t.identifier('value'),
                            ),
                          ),
                          t.returnStatement(t.booleanLiteral(true)),
                        ]),
                      ),
                    ]),
                  ]),
                ),
              ]),
            ),
            // willDestroy
            t.classMethod(
              'method',
              t.identifier('willDestroy'),
              [],
              t.blockStatement([
                t.expressionStatement(
                  t.callExpression(
                    t.memberExpression(t.super(), t.identifier('willDestroy')),
                    [],
                  ),
                ),
                t.expressionStatement(
                  t.callExpression(
                    t.memberExpression(
                      t.memberExpression(
                        t.thisExpression(),
                        t.identifier('_delegate'),
                      ),
                      t.identifier('willDestroy'),
                    ),
                    [],
                  ),
                ),
              ]),
            ),
          ]),
        );

        // Create variable declarations with unique names to avoid conflicts
        const currentImplDeclaration = t.variableDeclaration('let', [
          t.variableDeclarator(
            t.identifier(implVarName),
            t.identifier(originalClassName),
          ),
        ]);

        const currentProxyDeclaration = t.variableDeclaration('let', [
          t.variableDeclarator(t.identifier(proxyVarName), t.nullLiteral()),
        ]);

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
          // IMPORTANT: Class must be declared BEFORE the variables that reference it
          path.replaceWithMultiple([
            originalClass, // The original class (no longer exported) - MUST BE FIRST
            currentImplDeclaration,
            currentProxyDeclaration,
            t.exportDefaultDeclaration(proxyClass), // Export the proxy class
          ]);
        } else {
          // Case 2: Separate declaration - class already exists, just replace the export
          path.replaceWithMultiple([
            currentImplDeclaration,
            currentProxyDeclaration,
            t.exportDefaultDeclaration(proxyClass), // Export the proxy class
          ]);
        }

        // Add HMR code after the export using babel template
        if (programPath) {
          const hmrCode = `
            if (import.meta.hot) {
              import.meta.hot.accept((newModule) => {
                if (import.meta.hot.data._hotReload && newModule?.default?.Impl) {
                  import.meta.hot.data._hotReload(newModule.default.Impl);
                }
              });
              
              import.meta.hot.data._hotReload = import.meta.hot.data._hotReload || function(NewImpl) {
                // Skip reload if no instance has been created yet
                if (!${proxyVarName}) {
                  ${implVarName} = NewImpl;
                  return;
                }
                
                const oldDelegate = ${proxyVarName}._delegate;
                ${implVarName} = NewImpl;
                const newDelegate = new ${implVarName}();
                ${proxyVarName}._delegate = newDelegate;
                
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
                  
                  // Skip Function properties - they should not be synced
                  if (typeof previousValue === 'function') {
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
                
                if (oldDelegate.willDestroy) {
                  oldDelegate.willDestroy();
                }
              };
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
        path.scope.crawl();
      },
    },
  };
}
