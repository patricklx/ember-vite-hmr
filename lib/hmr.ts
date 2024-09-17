import path from 'path';
import { Plugin } from 'vite';
import { NodePath, transform, transformSync } from '@babel/core';

const getHotComponent = (imp: string, specifier: string) => `
import { ${specifier} as TargetComponent } from "${imp}";
import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { createComputeRef } from "@glimmer/reference";
import { curry } from '@glimmer/runtime';
import { CurriedTypes } from '@glimmer/vm';

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
    this.curried = curry(CurriedTypes.Component, TargetComponent, owner, { positional, named});
    if (import.meta.hot) {
      // Rehydrate any saved state
      import.meta.hot.accept('${imp}', (module) => {
        this.curried = curry(CurriedTypes.Component, module.default, owner, { positional, named});
      })
    }
  }
  <template>
    <this.curried @__hot__={{this.hot}}></this.curried>
  </template>
}
`;

const virtualPrefix = '/ember-vite-hmr/virtual/component:';

export function hmr(enableViteHmrForModes: string[] = ['development']): Plugin {
  let conf: any;
  return {
    name: 'hmr-plugin',
    enforce: 'post',
    configResolved(config) {
      conf = config;
      process.env['EMBER_VITE_HMR_ENABLED'] = enableViteHmrForModes
        .includes(config.mode)
        .toString();
    },
    resolveId(id, importer) {
      if (importer.startsWith(virtualPrefix)) {
        importer = path.join(process.cwd(), 'package.json');
        return this.resolve(id, importer);
      }
      if (id.startsWith(virtualPrefix)) {
        return id;
      }
      if (id.startsWith('/@id/embroider_virtual:')) {
        return this.resolve(
          id.replace('/@id/', ''),
          path.join(process.cwd(), 'package.json'),
        );
      }
      if (id.startsWith(`/@id/${virtualPrefix}`)) {
        return this.resolve(
          id.replace('/@id/', ''),
          path.join(process.cwd(), 'package.json'),
        );
      }
      if (id === '/ember-vite-hmr/services/vite-hot-reload') {
        return this.resolve(
          'ember-vite-hmr/services/vite-hot-reload',
          path.join(process.cwd(), 'package.json'),
        );
      }
    },
    load(id: string) {
      if (id.startsWith(virtualPrefix)) {
        const [imp, specifier] = id
          .slice(virtualPrefix.length, -'.gts'.length)
          .split(':');
        return getHotComponent(imp, specifier);
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
      if (!ctx.file.split('?')[0].endsWith('.hbs')) {
        return ctx.modules;
      }
      const otherModules = [];
      const pairedModule = ctx.modules.find((m) =>
        [...m.importers].find(
          (i) =>
            i.id.startsWith('embroider_virtual') &&
            i.id.endsWith('-embroider-pair-component'),
        ),
      );
      if (pairedModule) {
        const pairComponent = [...pairedModule.importers].find(
          (i) =>
            i.id.startsWith('embroider_virtual') &&
            i.id.endsWith('-embroider-pair-component'),
        );
        if (pairComponent) {
          const componentModule = [...pairComponent.clientImportedModules].find(
            (cim) => cim.id.split('?')[0].match(/\/component\.(js|ts|gjs|gts)/),
          );
          if (componentModule) {
            otherModules.push(componentModule);
          }
        }
      }
      return [...ctx.modules, ...otherModules];
    },
    async transform(source, id) {
      const resourcePath = id.replace(/\\/g, '/').split('?')[0];
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
      let didReplaceSources = false;
      const name = require(`${process.cwd()}/package.json`).name;
      if (resourcePath.includes(`/assets/${name}.js`)) {
        const result = [...source.matchAll(/import \* as [^ ]+ from (.*);/g)];
        source += result
          .map((r) => {
            if (r[1].includes('initializers')) {
              return `\nimport.meta.hot.accept(${r[1]}, () => window.location.reload());`;
            }
            return `\nimport.meta.hot.accept(${r[1]});`;
          })
          .join('');
      }
      if (
        resourcePath.endsWith('.hbs') ||
        resourcePath.endsWith('.gjs') ||
        resourcePath.endsWith('.gts') ||
        resourcePath.includes(`/assets/${name}.js`)
      ) {
        const resolveDep = async (dep) => {
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
          ...source.matchAll(/import.meta.hot.accept\(\'([^']+)\'/g),
        ];
        for (const resultElement of result) {
          const dep = resultElement[1];
          const id = await resolveDep(dep);
          if (!id) continue;
          if (dep === id) continue;
          didReplaceSources = true;
          source = source.replace(
            `import.meta.hot.accept('${dep}'`,
            `import.meta.hot.accept('${id}'`,
          );
        }
        const importMatches = [...source.matchAll(/import\('([^']+)'/g)];
        for (const resultElement of importMatches) {
          const dep = resultElement[1];
          if (!dep.startsWith(virtualPrefix)) {
            continue;
          }
          const [imp, specifier] = dep
            .slice(virtualPrefix.length, -'.gts'.length)
            .split(':');
          const id = await resolveDep(imp);
          if (!id) continue;
          if (dep === id) continue;
          didReplaceSources = true;
          source = source.replace(
            `import('${virtualPrefix}${imp}`,
            `import('${virtualPrefix}${id}`,
          );
        }
      }

      if (didReplaceSources) {
        source = transformSync(source, {
          filename: id,
          babelrc: false,
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
                    node.arguments[0].value.includes('node_modules')
                  ) {
                    let IfStatement = path as NodePath;
                    while (IfStatement.type !== 'IfStatement') {
                      IfStatement = IfStatement.parentPath;
                    }
                    IfStatement.remove();
                  }
                },
              },
            },
          ],
        }).code;
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
