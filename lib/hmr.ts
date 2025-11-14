import path from 'path';
import {Plugin, ViteDevServer} from 'vite';
import {NodePath, parseSync } from '@babel/core';
import {readFileSync} from 'fs';

function generateContent(yields: string[]) {
    if (!yields.includes('default')) {
        yields.push('default');
    }
    let all = yields.map((y) => `(has-block '${y}')`).join(' ');
    let str = '';
    for (const y of yields) {
        str += `
        <:${y} as |a b c d e f g h i j k l|>{{yield a b c d e f g h i j k l to='${y}'}}</:${y}>
    `;
    }
    return `
    {{#if (notAny ${all})}}
        <this.curried @__hot__={{this.hot}} />
    {{else}}
        <this.curried @__hot__={{this.hot}} >
        ${str}
        </this.curried>
    {{/if}}
  `;
}

const getHotComponent = (imp: string, specifier: string, yields: string[]) => `
import { ${specifier} as TargetComponent } from "${imp}";
import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { createComputeRef } from "@glimmer/reference";
import { curry } from '@glimmer/runtime';

function notAny(...yields) {
  return !yields.some((y) => !!y); 
}

export default class HotComponent extends Component {
  @tracked curried;
  hot = {};
  constructor(owner, args) {
    super(owner, args);
    const named = {};
    const positional = [];
    for (const name of Object.keys(args)) {
      named[name] = createComputeRef(() => args[name]);
    }
    const CurriedComponent = 0;
    this.curried = curry(CurriedComponent, TargetComponent, owner, { positional, named});
    if (import.meta.hot) {
      // Rehydrate any saved state
      import.meta.hot.accept('${imp}', (module) => {
        this.curried = curry(CurriedComponent, module.default, owner, { positional, named});
      })
    }
  }
  <template>
    ${generateContent(yields)}
  </template>
}
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

function difference(a: Set<any>, b: Set<any>) {
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

const virtualPrefix = '/ember-vite-hmr/virtual/component:';

export function hmr(enableViteHmrForModes: string[] = ['development']): Plugin {
    let conf: any;
    let server: ViteDevServer;
    return {
        name: 'hmr-plugin',
        enforce: 'post',
        configureServer(s) {
            server = s;
        },
        configResolved(config) {
            conf = config;
            process.env['EMBER_VITE_HMR_ENABLED'] = enableViteHmrForModes
                .includes(config.mode)
                .toString();
        },
        async resolveId(id, importer, meta) {
            if (importer?.startsWith(virtualPrefix)) {
                importer = path.join(process.cwd(), 'package.json');
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
                    path.join(process.cwd(), 'package.json'),
                    meta,
                );
            }
        },
        async load(id: string) {
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
                // @ts-ignore
                const res = await server.transformRequest(filename);
                const content = res?.code;
                const resId = await this.resolve(
                    filename,
                    path.resolve(process.cwd(), 'package.json'),
                );
                const cached = getYieldsFromFile(resId!.id, content!);
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
            if (process.env['EMBER_VITE_HMR_ENABLED'] !== 'true') {
                return html;
            }
            const fullPath = path.resolve(__dirname, '..', 'setup-ember-hmr.js');
            return (
                `<script type="module" src="${fullPath}" />${html}`
            );
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
                const source = readFileSync(id).toString();
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
            if (process.env['EMBER_VITE_HMR_ENABLED'] !== 'true') {
                return source;
            }
            const resourcePath = normalizePath(id.split('?')[0]!);
            const supportedExt = ['.hbs', '.gjs', 'gts', '.js', '.ts'];
            if (!supportedExt.some(x => resourcePath.endsWith(x))) {
                return source;
            }
            const name = require(`${process.cwd()}/package.json`).name;
            if (resourcePath.includes(`${name}/app/app.js`)) {
                source += `\n
              let prevCompatModules = Object.assign({}, compatModules);
              import.meta.hot.accept('@embroider/virtual/compat-modules', (m) => {
                for (const [name, module] of Object.entries(m.default)) {
                  if (name.includes('initializers') && prevCompatModules[name]?.default !== module.default) {
                    window.location.reload();
                  }
                }
                prevCompatModules = m.default;
              })`;
            }
            if (resourcePath.includes('ember-vite-hmr/virtual/components')) {
                return source;
            }

            if (resourcePath.includes('node_modules')) {
                return source;
            }

            // Add hot reload statements for tracked imports (only non-node_modules)
            // Use babel visitor to extract __hmr_import_metadata__
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
                let importVar: string | null = null;
                let bindings: string[] = [];
                const importStatements: Array<{ local: string, source: string, specifier: string }> = [];

                const traverse = require('@babel/traverse').default;
                
                // First pass: Extract metadata
                traverse(result, {
                    ExportNamedDeclaration(path: NodePath<any>) {
                        const declaration = path.node.declaration;
                        
                        // Check if this is: export const __hmr_import_metadata__ = {...}
                        if (
                            declaration?.type === 'VariableDeclaration' &&
                            declaration.declarations?.[0]?.id?.name === '__hmr_import_metadata__'
                        ) {
                            const init = declaration.declarations[0].init;
                            
                            if (init?.type === 'ObjectExpression') {
                                // Extract importVar and bindings from the object
                                for (const prop of init.properties) {
                                    if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') {
                                        if (prop.key.name === 'importVar' && prop.value.type === 'StringLiteral') {
                                            importVar = prop.value.value;
                                        } else if (prop.key.name === 'bindings' && prop.value.type === 'ArrayExpression') {
                                            bindings = prop.value.elements
                                                .filter((el: any) => el?.type === 'StringLiteral')
                                                .map((el: any) => el.value);
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
                        ImportDeclaration(path: NodePath<any>) {
                            const importSource = path.node.source.value;
                            
                            for (const specifier of path.node.specifiers) {
                                const local = specifier.local.name;
                                
                                if (bindings.includes(local)) {
                                    let specifierName = 'default';
                                    
                                    if (specifier.type === 'ImportDefaultSpecifier') {
                                        specifierName = 'default';
                                    } else if (specifier.type === 'ImportSpecifier') {
                                        // For named imports, use the imported name
                                        specifierName = specifier.imported.name;
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

                // Process metadata if we found importVar (even with empty bindings)
                if (importVar) {

                    // Generate hot reload code for each import (only if we have bindings)
                    const hotReloadStatements: string[] = [];
                    for (const imp of importStatements) {
                        // Resolve the import to check if it's from node_modules
                        const resolved = await this.resolve(imp.source, resourcePath, {});
                        if (resolved?.id && normalizePath(resolved.id).includes('node_modules')) {
                            // Skip node_modules imports
                            continue;
                        }

                        const sourceId = imp.source.replace(/@embroider\/virtual/g, 'embroider_virtual');
                        const virtualPath = `/ember-vite-hmr/virtual/component:${sourceId}::${imp.specifier}.gjs`;

                        hotReloadStatements.push(`
  (async () => {
    const GlimmerComponent = (await import('@glimmer/component')).default;
    if (${imp.local}.prototype instanceof GlimmerComponent) {
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
                    source = source.replace(/export const __hmr_import_metadata__[^;]+;/, '');
                    
                    // Add HMR code if we have any statements OR if we have bindings (even if all were skipped)
                    if (hotReloadStatements.length > 0 || bindings.length > 0) {
                        const hotReloadCode = `
if (import.meta.hot) {
${hotReloadStatements.join('\n')}
}`;
                        source = source + hotReloadCode;
                    }
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
  if (import.meta.hot && window.emberHotReloadPlugin) {
      const result = window.emberHotReloadPlugin.canAcceptNew(import.meta.url);
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
