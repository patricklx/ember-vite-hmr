import { defineConfig } from 'vite';
import { extensions, classicEmberSupport, ember } from '@embroider/vite';
import { babel } from '@rollup/plugin-babel';
import { hmr } from 'ember-vite-hmr';

export default defineConfig({
  plugins: [
    classicEmberSupport(),
    ember(),
    hmr(),
    // extra plugins here
    babel({
      babelHelpers: 'runtime',
      extensions,
    }),
  ],
});
