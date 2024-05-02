'use strict';

const { addonV1Shim } = require('@embroider/addon-shim');
const path = require('path');
module.exports = addonV1Shim(__dirname);
const included = module.exports.included;

Object.assign(module.exports, {
  _getBabelOptions() {
    const parentOptions = this.parent && this.parent.options;
    const appOptions = this.app && this.app.options;
    const addonOptions = parentOptions || appOptions || {};

    addonOptions.babel = addonOptions.babel || {};
    addonOptions.babel.plugins = addonOptions.babel.plugins || [];
    return addonOptions.babel;
  },
  included(...args) {
    this._getBabelOptions().plugins.push([
      require.resolve('./dist/lib/babel-plugin.js'),
      { v: 4, appName: this.app.name },
    ]);
    this._super.included; // need to access this somehow? otherwise it fails later on...

    let astPlugin = this._buildPlugin();
    astPlugin.parallelBabel = {
      requireFile: __filename,
      buildUsing: '_buildPlugin',
      params: {},
    };
    const compatAppBuilder = require.resolve(
      '@embroider/compat/src/compat-app-builder',
      { paths: [process.cwd()] },
    );
    const CompatAppBuilder = require(compatAppBuilder).CompatAppBuilder;
    const etcOptions = CompatAppBuilder.prototype.etcOptions;
    CompatAppBuilder.prototype.etcOptions = async function (...args) {
      const opts = await etcOptions.call(this, ...args);
      opts.transforms.push(astPlugin);
      return opts;
    };
    included.call(this, ...args);
  },

  _buildPlugin() {
    return require('./dist/lib/babel-plugin').hotAstProcessor.transform;
  },
});
