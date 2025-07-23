import path from 'path';
import { Plugin, ViteDevServer } from 'vite';
import { NodePath, transformSync } from '@babel/core';
import { readFileSync } from 'fs';

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
    resolveId(id, importer, meta) {
      if (importer?.startsWith(virtualPrefix)) {
        importer = path.join(process.cwd(), 'package.json');
        return this.resolve(id, importer, meta);
      }
      if (id.startsWith(virtualPrefix)) {
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
        let [imp, specifier] = id
          .split('?')[0]!
          .slice(virtualPrefix.length, -'.gts'.length)
          .split(':');
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
      return (
        `<script type="module" src="/ember-vite-hmr/services/vite-hot-reload" />` +
        html
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
      const resourcePath = id.replace(/\\/g, '/').split('?')[0]!;
      let didReplaceSources = false;
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

      const map: Record<string, string> = {};
      if (!resourcePath.includes(`node_modules`)) {
        const resolveDep = async (dep: string) => {
          const resolved = await this.resolve(dep, resourcePath, {});
          let id = resolved?.id;
          if (!id) return;
          let appRoot = conf.root + '/app/';
          if (id.startsWith(appRoot) && !id.startsWith('embroider_virtual:')) {
            id = 'app/' + id.split(appRoot)[1];
          }
          if (id.startsWith('embroider_virtual:')) {
            id = '@id/' + id;
          }
          if (
            path.resolve(id).replace(/\\/g, '/') === id &&
            path.isAbsolute(id)
          ) {
            if (!id.startsWith('/')) {
              id = '/' + id;
            }
            id = '/@fs' + id;
          }
          if (!id.startsWith('/') && !id.startsWith('.')) {
            id = '/' + id;
          }
          return id;
        };

        const result = [
          ...source.matchAll(/import.meta.hot.accept\(['"]([^'"]+)['"]/g),
        ];
        for (const resultElement of result) {
          const dep = resultElement[1]!;
          let possibleVirtual = { dep, specifier: null as any };
          if (dep.includes(virtualPrefix)) {
            const [imp, specifier] = dep.slice(virtualPrefix.length).split(':');
            possibleVirtual.dep = imp!;
            possibleVirtual.specifier = specifier;
          }
          let id = await resolveDep(possibleVirtual.dep);
          if (!id) continue;
          if (dep === id) continue;
          if (possibleVirtual.dep !== dep) {
            id = virtualPrefix + id + ':' + possibleVirtual.specifier;
          }
          didReplaceSources = true;
          map[dep] = id;
        }
      }

      source = source.replace(
        /import.meta.hot.accept\(['"]([^'"]+)['"]/g,
        function (str, group) {
          if (group.startsWith(virtualPrefix) && map[group]) {
            const id = map[group];
            return `import.meta.hot.accept("${id}"`;
          }
          return str;
        },
      );

      source = source.replace(
        /import\(['"]([^'"]+)['"]/g,
        function (str, group) {
          if (group.startsWith(virtualPrefix) && map[group]) {
            const id = map[group];
            return `import("${id}"`;
          }
          return str;
        },
      );

      if (didReplaceSources) {
        source = transformSync(source, {
          filename: id,
          babelrc: false,
          configFile: false,
          plugins: [
            {
              name: 'cleanup',
              visitor: {
                CallExpression(path) {
                  const node = path.node;
                  if (
                    node.callee.type === 'Import' &&
                    node.arguments[0]?.type === 'StringLiteral' &&
                    node.arguments[0].value.includes(
                      'ember-vite-hmr/virtual/component',
                    ) &&
                    map[node.arguments[0].value]?.includes('node_modules')
                  ) {
                    let IfStatement = path as NodePath;
                    while (IfStatement.type !== 'IfStatement') {
                      IfStatement = IfStatement.parentPath!;
                    }
                    IfStatement.remove();
                  }
                },
              },
            },
          ],
        })!.code!;
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
