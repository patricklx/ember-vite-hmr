import path from 'path';

export function hmr() {
  return {
    name: 'hmr-plugin',
    enforce: 'post',
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
      if (
          resourcePath.endsWith('.hbs') ||
          resourcePath.endsWith('.gjs') ||
          resourcePath.endsWith('.gts')
      ) {
        const result = [...source.matchAll(/import.meta.hot.accept\(\'([^']+)\'/g)];
        for (const resultElement of result) {
          const dep = resultElement[1];
          const resolved = await this.resolve(
              dep,
              resourcePath,
              {},
          );
          let id = resolved.id;
          if (id.includes('rewritten-app')) {
            id = id.split('rewritten-app')[1];
          }
          if (path.resolve(id).replace(/\\/g, '/') === id && path.isAbsolute(id)) {
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
