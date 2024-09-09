import path from 'path';
import { Plugin } from 'vite';

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
    resolveId(id) {
      if (id.startsWith('/@id/embroider_virtual:')) {
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
      const supportedPaths = ['routers', 'controllers', 'routes'];
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
      const name = require(`${process.cwd()}/package.json`).name;
      if (resourcePath.includes(`/assets/${name}.js`)) {
        const result = [
          ...source.matchAll(/import \* as [^ ]+ from (.*);/g),
        ];
        source += result.map(r => {
          if (r[1].includes('initializers')) {
            return `\nimport.meta.hot.accept(${r[1]}, () => window.location.reload());`;
          }
          return `\nimport.meta.hot.accept(${r[1]});`;
        }).join('');
      }
      if (
        resourcePath.endsWith('.hbs') ||
        resourcePath.endsWith('.gjs') ||
        resourcePath.endsWith('.gts') ||
        resourcePath.includes(`/assets/${name}.js`)) {
        const result = [
          ...source.matchAll(/import.meta.hot.accept\(\'([^']+)\'/g),
        ];
        for (const resultElement of result) {
          const dep = resultElement[1];
          const resolved = await this.resolve(dep, resourcePath, {});
          let id = resolved?.id;
          if (!id) continue;
          let appRoot = conf.root + '/app/';
          if (
            id.startsWith(appRoot) &&
            !id.startsWith('embroider_virtual:')
          ) {
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
          source = source.replace(
            `import.meta.hot.accept('${dep}'`,
            `import.meta.hot.accept('${id}'`,
          );
        }
      }
      if (
        !supportedPaths.some((s) => resourcePath.includes(`/${s}/`)) &&
        !supportedFileNames.some((s) => resourcePath.endsWith(s))
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
