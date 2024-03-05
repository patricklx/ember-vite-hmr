import path from 'path';

export function hmr() {
  return {
    name: 'hmr-plugin',
    enforce: 'post',
    resolveId(id) {
      if (id.startsWith('/@id/embroider_virtual:')) {
        return this.resolve(id.replace('/@id/', ''), process.cwd());
      }
      if (id === '/ember-vite-hmr/services/webpack-hot-reload') {
        return this.resolve(
          'ember-vite-hmr/services/webpack-hot-reload',
          process.cwd(),
        );
      }
    },
    transformIndexHtml(html) {
      return (
        `<script type="module" src="/ember-vite-hmr/services/webpack-hot-reload" />` +
        html
      );
    },
    handleHotUpdate(ctx) {
      if (!ctx.file.split('?')[0].endsWith('.hbs')) {
        return ctx.modules;
      }
      const otherModules = [];
      const pairedModule = ctx.modules.find(m => [...m.importers].find(i => i.id.startsWith('embroider_virtual') && i.id.endsWith('-embroider-pair-component')));
      if (pairedModule) {
        const pairComponent = [...pairedModule.importers].find(i => i.id.startsWith('embroider_virtual') && i.id.endsWith('-embroider-pair-component'));
        if (pairComponent) {
          const componentModule = [...pairComponent.clientImportedModules].find(cim => cim.id.split('?')[0].match(/\/component\.(js|ts|gjs|gts)/));
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
        'router.js',
        'router.ts',
        'router.gts',
        'router.gjs',
        'controller.js',
        'controller.ts',
      ];
      if (resourcePath.includes('/-components/')) {
        return source;
      }
      const name =  require(`${process.cwd()}/package.json`).name;
      if (resourcePath.includes(`/assets/${name}.js`)) {
        source += `\nimport.meta.hot.accept();`;
      }
      if (
        resourcePath.endsWith('.hbs') ||
        resourcePath.endsWith('.gjs') ||
        resourcePath.endsWith('.gts')
      ) {
        const result = [
          ...source.matchAll(/import.meta.hot.accept\(\'([^']+)\'/g),
        ];
        for (const resultElement of result) {
          const dep = resultElement[1];
          const resolved = await this.resolve(dep, resourcePath, {});
          let id = resolved.id;
          if (id.includes('rewritten-app') && !id.startsWith('embroider_virtual:')) {
            id = id.split('rewritten-app')[1];
          }
          if (id.startsWith('embroider_virtual:')) {
            id = '/@id/' + id;
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
        return source;
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
