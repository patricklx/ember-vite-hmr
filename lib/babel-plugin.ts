import { parse, PluginObj } from '@babel/core';
import { NodePath } from '@babel/traverse';
import type * as BabelTypesNamespace from '@babel/types';
import {
  Identifier,
  Program,
  V8IntrinsicIdentifier,
} from '@babel/types';
import * as glimmer from '@glimmer/syntax';
import { ASTv1, NodeVisitor, WalkerPath, ASTPluginEnvironment } from '@glimmer/syntax';

export type BabelTypes = typeof BabelTypesNamespace;

const builtInComponents = ['LinkTo'];
const builtInHelpers = [
  '-get-dynamic-var',
  '-element',
  '-lf-get-outlet-state',
  '-in-element',
  'in-element',
  '-with-dynamic-vars',
  'action',
  'array',
  'component',
  'concat',
  'debugger',
  'each',
  'each-in',
  'fn',
  'get',
  'has-block',
  'has-block-params',
  'hasBlock',
  'hasBlockParams',
  'hash',
  'if',
  'input',
  'let',
  'link-to',
  'loc',
  'log',
  'mount',
  'mut',
  'on',
  'outlet',
  'partial',
  'query-params',
  'readonly',
  'textarea',
  'unbound',
  'unless',
  'with',
  'yield',
  'modifier',
  'helper',
];

function dasherize(str: string) {
  return str
    .trim()
    .split(/\.?(?=[A-Z])/)
    .join('-')
    .toLowerCase();
}

class HotAstProcessor {
  options = {
    itsStatic: false,
  };
  counter = 0;
  meta = {
    usedImports: [],
    importVar: null,
  };

  transform(env: ASTPluginEnvironment) {
    if (!this.meta.importVar)
      return {
        visitor: {},
      };
    const meta = this.meta;
    meta.usedImports = new Set();
    const usedImports = this.meta.usedImports;
    const imports = [...env.locals];
    if (!meta.importVar) {
      return {
        visitor: {},
      };
    }
    const importVar = meta.importVar.name;
    env.locals.length = 0;
    env.locals.push(importVar);
    return {
      visitor: this.buildVisitor({
        importVar,
        imports,
        changes: [],
        usedImports,
      }),
    };
  }

  buildVisitor({ importVar, imports, changes, hotReplaced, usedImports }) {
    const findBlockParams = function (
      expression: string,
      p: WalkerPath<
        | ASTv1.BlockStatement
        | ASTv1.Block
        | ASTv1.ElementNode
        | ASTv1.PathExpression
      >,
    ): boolean {
      if (
        p.node &&
        p.node.type === 'BlockStatement' &&
        p.node.program.blockParams.includes(expression)
      ) {
        return true;
      }
      const node = p.node as any;
      if (node && node.blockParams && node.blockParams.includes(expression)) {
        return true;
      }
      if (!p.parent) return false;
      return findBlockParams(expression, p.parent as any);
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
        if (node.original === 'this') return;
        if (node.original.startsWith('@')) return;
        if (node.original === 'block') return;
        if (node.original.startsWith('this.')) return;
        if (findBlockParams(node.original.split('.')[0], p)) return;
        if (importVar) {
          if (imports.includes(node.original)) {
            usedImports.add(node.original);
            node.original = `${importVar}.${node.original}`;
            node.parts = node.original.split('.');
          }
          return;
        }
        const params = [];
        const blockParams = [];
        const letBlock = glimmer.builders.path('let');
        if (
          node.original === 'helper' ||
          node.original === 'component' ||
          node.original === 'modifier'
        ) {
          if (
            p.parentNode.params[0].original &&
            findBlockParams(p.parentNode.params[0].original.split('.')[0], p)
          )
            return;
          if (p.parentNode.params[0].original?.includes('.')) return;
          const sub = glimmer.builders.sexpr(
            node.original,
            [p.parentNode.params[0]],
            glimmer.builders.hash([]),
          );
          const param = glimmer.builders.sexpr(
            'webpack-hot-reload',
            [sub],
            glimmer.builders.hash([
              glimmer.builders.pair(
                'type',
                glimmer.builders.string(node.original),
              ),
            ]),
          );
          p.parentNode.params.splice(0, 1);
          params.push(param);
          const name = node.original + '_' + this.counter;
          blockParams.push(name);
          node.type = 'PathExpression';
          node.original = name;
          const block = glimmer.builders.blockItself([], blockParams);
          const b = glimmer.builders.block(letBlock, params, null, block);
          changes.push(b);
          this.counter++;
          return;
        }
        if (builtInHelpers.includes(node.original)) {
          return;
        }
        if (!builtInHelpers.includes(node.original)) {
          if (p.parentNode?.type === 'ElementModifierStatement') return;
        }
        const firstLetter = node.original.split('.').slice(-1)[0]![0]!;
        let type = 'helper';
        if (
          (this.options.itsStatic &&
            p.parentNode?.type === 'MustacheStatement') ||
          firstLetter === firstLetter.toUpperCase()
        ) {
          type = 'component';
        }
        const sub = glimmer.builders.sexpr(type, [
          glimmer.builders.string(node.original),
          ...(p.parentNode.type === 'SubExpression' ? p.parentNode.params : []),
        ]);
        const param = glimmer.builders.sexpr(
          'webpack-hot-reload',
          [sub],
          glimmer.builders.hash([
            glimmer.builders.pair('type', glimmer.builders.string(type)),
          ]),
        );
        params.push(param);
        const name = type + '_' + this.counter;
        blockParams.push(name);
        node.type = 'PathExpression';
        node.original = name;
        if (!params.length) return;
        const block = glimmer.builders.blockItself([], blockParams);
        const b = glimmer.builders.block(letBlock, params, null, block);
        changes.push(b);
        this.counter++;
      },
      ElementNode: (
        element: ASTv1.ElementNode,
        p: WalkerPath<ASTv1.ElementNode>,
      ) => {
        const params = [];
        const blockParams = [];
        const letBlock = glimmer.builders.path('let');
        element.modifiers.forEach((modifier) => {
          if (importVar) {
            return;
          }
          if (!modifier.path.original) return;
          if (modifier.path.original && modifier.path.original.includes('.'))
            return;
          if (builtInHelpers.includes(modifier.path.original)) {
            return;
          }
          const sub = glimmer.builders.sexpr('modifier', [
            {
              ...((modifier.path.original &&
                glimmer.builders.string(modifier.path.original)) ||
                modifier.path),
            },
          ]);
          const param = glimmer.builders.sexpr(
            'webpack-hot-reload',
            [sub],
            glimmer.builders.hash([
              glimmer.builders.pair(
                'type',
                glimmer.builders.string('modifier'),
              ),
            ]),
          );
          params.push(param);
          const name = 'modifier_' + this.counter;
          blockParams.push(name);
          modifier.path.type = 'PathExpression';
          modifier.path.original = 'modifier_' + this.counter;
          this.counter++;
        });

        if (findBlockParams(element.tag.split('.')[0], p)) return;
        if (importVar) {
          if (imports.includes(element.tag)) {
            usedImports.add(element.tag);
            element.tag = `${importVar}.${element.tag}`;
          }
          return;
        }
        if (builtInComponents.includes(element.tag)) {
          return;
        }
        if (element.tag[0] === element.tag[0].toUpperCase()) {
          const sub = glimmer.builders.sexpr('component', [
            glimmer.builders.string(dasherize(element.tag)),
          ]);
          const param = glimmer.builders.sexpr(
            'webpack-hot-reload',
            [sub],
            glimmer.builders.hash([
              glimmer.builders.pair(
                'type',
                glimmer.builders.string('component'),
              ),
            ]),
          );
          params.push(param);
          const name = 'Component_' + this.counter;
          blockParams.push(name);
          element.tag = name;
        }
        const block = glimmer.builders.blockItself([], blockParams);
        if (!params.length) return;
        const b = glimmer.builders.block(letBlock, params, null, block);
        changes.push(b);
        this.counter++;
      },
      Program: {
        exit(program) {},
      },
    };
    return visitor;
  }

  replaceInAst(
    ast: glimmer.ASTv1.Template,
    importVar?: string,
    imports?: string[],
  ) {
    const usedImports = new Set();
    const hotReplaced = {
      components: new Set<string>(),
      helpers: new Set<string>(),
      modifiers: new Set<string>(),
      others: new Set<string>(),
      info: {
        components: {} as { [x: string]: { resolvedPath?: string } },
        helpers: {} as {
          [x: string]: { nodes: ASTv1.PathExpression[]; resolvedPath: string };
        },
        modifiers: {} as {
          [x: string]: { nodes: ASTv1.PathExpression[]; resolvedPath: string };
        },
      },
    };

    const changes = [];
    const visitor = this.buildVisitor({
      importVar,
      imports,
      changes,
      hotReplaced,
      usedImports,
    });
    glimmer.traverse(ast, visitor);

    const program = ast;
    let body = [...program.body];
    for (const letBlock of changes) {
      letBlock.program.body = body;
      body = [letBlock];
    }
    program.body.length = 0;
    program.body.push(...body);

    return usedImports;
  }

  processAst(contents: string, importVar?: string, imports?: string[]) {
    const ast = glimmer.preprocess(contents);
    this.counter = 0;
    this.usedImports = this.replaceInAst(ast, importVar, imports);
    return glimmer.print(ast);
  }
}

export const hotAstProcessor = new HotAstProcessor();

export default function hotReplaceAst(
  { types: t }: { types: BabelTypes },
  options,
) {
  let imports: string[] = [];
  let importMap: Record<string, string> = {};
  let tracked: Identifier;
  let importVar: Identifier;
  let importsKlass: any;
  let templateImportSpecifier = '';
  return {
    name: 'hot-reload-imports',
    visitor: {
      Program: {
        enter(path: NodePath<Program>) {
          templateImportSpecifier = '';
          importVar = null;
          tracked = null;
          importMap = {};
          imports = [];
          exports.hotAstProcessor.meta.usedImports = [];
          exports.hotAstProcessor.meta.importVar = null;
          const filename = path.hub.file.opts.filename.split('?')[0];
          if (
            !filename.endsWith('.hbs') &&
            !filename.endsWith('.gts') &&
            !filename.endsWith('.gjs')
          ) {
            return;
          }
          if (!filename.includes('rewritten-app')) {
            return;
          }
          const node = path.node;
          const templateImport = node.body.find(
            (i) =>
              i.type === 'ImportDeclaration' &&
              i.source.value === '@ember/template-compiler',
          );
          if (templateImport) {
            const def = templateImport.specifiers[0];
            templateImportSpecifier = def.local.name;
          }

          tracked = path.scope.generateUidIdentifier('tracked');
          importVar = path.scope.generateUidIdentifier('__imports__');
          hotAstProcessor.meta.importVar = importVar;
          node.body.splice(
            0,
            0,
            t.importDeclaration(
              [t.importSpecifier(tracked, t.identifier('tracked'))],
              t.stringLiteral('@glimmer/tracking'),
            ),
          );
          let usedImports = new Set();
          const addedIds = new Set();
          path.traverse({
            ImportDeclaration: function (path) {
              path.node.specifiers.forEach(function (s) {
                imports.push(s.local.name);
                importMap[s.local.name] = {
                  source: path.node.source.value,
                  specifiers: path.node.specifiers,
                };
              });
            },
            Identifier(path) {
              if (addedIds.has(path.node)) {
                path.scope
                  .getBinding(path.node.name)
                  ?.referencePaths.push(path);
              }
            },
            CallExpression(path) {
              const call = path.node;
              if (
                templateImportSpecifier &&
                (call.callee as V8IntrinsicIdentifier).name ===
                  templateImportSpecifier &&
                (call.arguments[0]?.type === 'StringLiteral' ||
                  call.arguments[0]?.type === 'TemplateLiteral')
              ) {
                if (call.arguments[0].type === 'StringLiteral') {
                  call.arguments[0].value = hotAstProcessor.processAst(
                    call.arguments[0].value,
                    importVar.name,
                    imports,
                  );
                  hotAstProcessor.usedImports.forEach(
                    usedImports.add,
                    usedImports,
                  );
                }
                if (
                  call.arguments[0].type === 'TemplateLiteral' &&
                  call.arguments[0].quasis[0]
                ) {
                  call.arguments[0].quasis[0].value.raw =
                    hotAstProcessor.processAst(
                      call.arguments[0].quasis[0].value.raw,
                      importVar.name,
                      imports,
                    );
                  hotAstProcessor.usedImports.forEach(
                    usedImports.add,
                    usedImports,
                  );
                }
              }
            },
          });
          const lastImport = [...node.body]
            .reverse()
            .find((x) => x.type === 'ImportDeclaration')!;
          const idx = node.body.indexOf(lastImport);
          const importsVar = t.variableDeclaration('let', [
            t.variableDeclarator(importVar),
          ]);
          importsKlass = t.classExpression(
            path.scope.generateUidIdentifier('Imports'),
            null,
            t.classBody(
              [...usedImports].map((i) => {
                const x = t.identifier(i);
                addedIds.add(x);
                return t.classProperty(t.identifier(i), x, null, [
                  t.decorator(tracked),
                ]);
              }),
            ),
          );
          const assignment = t.expressionStatement(
            t.assignmentExpression(
              '=',
              importVar,
              t.newExpression(importsKlass, []),
            ),
          );
          const hotAccepts = [];
          for (const imp of [...usedImports]) {
            const { source, specifiers } = importMap[imp];
            const specifier = specifiers.find((s) => s.local.name === imp);
            const specifierName =
              specifier.imported?.name ||
              specifier.imported?.value ||
              'default';
            const ast = parse(
              `import.meta.hot.accept('${source}', (module) => (${importVar.name}.${imp}=module['${specifierName}']))`,
            );
            const impHot = ast?.program.body[0];
            hotAccepts.push(impHot);
          }
          const ifHot = t.ifStatement(
            t.memberExpression(
              t.metaProperty(t.identifier('import'), t.identifier('meta')),
              t.identifier('hot'),
            ),
            t.blockStatement([assignment, ...hotAccepts]),
          );
          node.body.splice(idx, 0, importsVar);
          node.body.push(ifHot);
        },
        exit(path, state) {
          const filename = path.hub.file.opts.filename.split('?')[0];
          if (!filename.includes('rewritten-app')) {
            return;
          }
          if (
            !filename.endsWith('.hbs') &&
            !filename.endsWith('.gts') &&
            !filename.endsWith('.gjs')
          ) {
            return;
          }
          path.traverse({
            ImportDeclaration: function (path) {
              path.node.specifiers.forEach(function (s) {
                imports.push(s.local.name);
                importMap[s.local.name] = {
                  source: path.node.source.value,
                  specifiers: path.node.specifiers,
                };
              });
            },
          });
          const node = path.node;
          const usedImports = hotAstProcessor.meta.usedImports;
          if (usedImports) {
            const lastImport = [...node.body]
              .reverse()
              .find((x) => x.type === 'ImportDeclaration');
            const idx = node.body.indexOf(lastImport);
            const assignment = node.body.at(-1);
            node.body.splice(-1, 1);
            node.body.splice(idx, 0, assignment);
            const hotAccepts = [];
            for (const imp of [...usedImports]) {
              const { source, specifiers } = importMap[imp];
              const specifier = specifiers.find((s) => s.local.name === imp);
              const specifierName =
                specifier.imported?.name ||
                specifier.imported?.value ||
                'default';
              const ast = parse(
                `import.meta.hot.accept('${source}', (module) => (${importVar.name}.${imp}=module['${specifierName}']))`,
              );
              const impHot = ast?.program.body[0];
              hotAccepts.push(impHot);
            }
            const ifHot = t.ifStatement(
              t.memberExpression(
                t.metaProperty(t.identifier('import'), t.identifier('meta')),
                t.identifier('hot'),
              ),
              t.blockStatement([...hotAccepts]),
            );
            node.body.push(ifHot);
            importsKlass.body.body.length = 0;
          }
        },
      },
      CallExpression: {
        exit(path, state) {
          const filename = path.hub.file.opts.filename.split('?')[0];
          if (filename.endsWith('.hbs')) {
            const usedImports = hotAstProcessor.meta.usedImports;
            [...usedImports].map((i) => {
              if (importsKlass.body.body.find((b) => b.key.name === i)) {
                return;
              }
              const x = t.identifier(i);
              const klassProp = t.classProperty(t.identifier(i), x, null, [
                t.decorator(tracked),
              ]);
              importsKlass.body.body.push(klassProp);
            });
          }
        },
      },
    },
  } as PluginObj;
}
