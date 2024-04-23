import { PluginObj } from '@babel/core';
import type * as BabelTypesNamespace from '@babel/types';
import {
  ImportDefaultSpecifier,
  ImportNamespaceSpecifier,
  ImportSpecifier,
  Program
} from '@babel/types';
import * as glimmer from '@glimmer/syntax';
import {
  ASTv1,
  NodeVisitor,
  WalkerPath
} from '@glimmer/syntax';

export type BabelTypes = typeof BabelTypesNamespace;


interface ASTPluginEnvironment {
  locals: string[];
}

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
    locals: new Set(),
    importVar: null,
    babelProgram: null,
    importBindings: new Set(),
  } as { locals: Set<string>, importVar: any, importBindings: Set<string>, babelProgram: Program };
  didCreateImportClass: boolean = false;

  constructor() {
    this.transform = this.transform.bind(this);
  }

  reset() {
    this.meta.importVar = null;
    this.meta.babelProgram = null;
    this.meta.importBindings = new Set<string>();
  }

  transform(env: ASTPluginEnvironment) {
    const meta = this.meta;
    const imports = [...env.locals];
    const importVar = env.meta.jsutils.bindExpression('null', null, { nameHint: 'template__imports__' });
    const findImport = function findImport(specifier) {
      return meta.babelProgram.body.find(b => b.type === 'ImportDeclaration' && b.specifiers.some(s => s.local.name === specifier));
    }
    return {
      visitor: {
        ...this.buildVisitor({
          importVar,
          imports,
          babelProgram: meta.babelProgram
        }),
        Template: {
          exit() {
            for (const local of env.locals) {
              if (findImport(local)) {
                meta.importBindings.add(local);
              }
            }
          }
        }
      },
    };
  }

  buildVisitor({ importVar, imports, babelProgram }: { importVar: string, imports: string[], babelProgram: Program }) {

    const findImport = function findImport(specifier) {
      return babelProgram.body.find(b => b.type === 'ImportDeclaration' && b.specifiers.some(s => s.local.name === specifier));
    }

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
        const original = node.original.split('.')[0];
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
          const parent = p.parentNode as ASTv1.MustacheStatement;
          const original = (parent.params[0] as ASTv1.StringLiteral).original.split('.')[0];
          if (
              original &&
            findBlockParams(original, p)
          )
            return;
          if (original?.includes('.')) return;
          if (!original) return;
          const param = glimmer.builders.path(`${importVar}.${original}`);
          parent.params.splice(0, 1);
          parent.params.push(param);
          return;
        }
        if (importVar) {
          if (imports.includes(node.original) && findImport(node.original)) {
            node.original = `${importVar}.${original}` + node.original.split('.').slice(1).join('.');
            node.parts = node.original.split('.');
          }
          return;
        }
      },
      ElementNode: (
        element: ASTv1.ElementNode,
        p: WalkerPath<ASTv1.ElementNode>,
      ) => {
        if (findBlockParams(element.tag.split('.')[0], p)) return;
        if (importVar) {
          if (imports.includes(element.tag) && findImport(element.tag)) {
            element.tag = `${importVar}.${element.tag}`;
          }
          return;
        }
      },
    };
    return visitor;
  }
}

export const hotAstProcessor = new HotAstProcessor();

export default function hotReplaceAst(
  { types: t }: { types: BabelTypes }) {
  let imports: string[] = [];
  let importMap: Record<string, {
    source: string;
    specifiers: (ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier)[];
  }> = {};
  return {
    name: 'a-hot-reload-imports',
    pre(file) {
      hotAstProcessor.reset();
      hotAstProcessor.meta.babelProgram = file.ast.program;
    },
    visitor: {
      Program(path, state) {
        t.class
        path.node.body;
      }
    },
  } as PluginObj;
}
