import EmberRouter from '@embroider/router';
import config from 'ember-vite-hmr-repro/config/environment';

export default class Router extends EmberRouter {
  location = config.locationType;
  rootURL = config.rootURL;
}

Router.map(function () {
  this.route('equipment');
  this.route('project');
});
