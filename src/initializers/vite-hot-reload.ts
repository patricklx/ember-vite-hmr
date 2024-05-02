import ApplicationInstance from "@ember/application/instance";

export function initialize(application: ApplicationInstance) {
  application.__container__.lookup('service:vite-hot-reload');
  const resolver =
    (application.__registry__.resolver as any)._fallback ||
    application.__registry__.resolver;
  const resolverResolve = resolver.resolve;
  resolver.resolve = function (name: string) {
    name = name.replace(/--hot-version--.*$/, '');
    return resolverResolve.call(this, name);
  };
}

export default {
  initialize,
};
