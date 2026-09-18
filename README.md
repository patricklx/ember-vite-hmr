ember-vite-hmr

Ember Vite Hmr plugin.

this can hot reload

- helpers
- modifiers
- components + templates, fcct components and its deps
- routes/controllers/route-templates

this tries to keep the state of properties in components and controller

it cannot hot reload local properties that turn out to be helpers/modifiers/components.

### HMR Lifecycle Hook

Components and services can implement a `_hmrAccepted` method to perform custom logic during hot module replacement:

```js
export default class MyComponent extends Component {
  _hmrAccepted(oldInstance) {
    // Custom state migration logic
    // oldInstance contains the previous component instance
    console.log('HMR accepted, migrating from:', oldInstance);
  }
}
```

This hook is called after automatic state synchronization but before the old instance is destroyed, allowing you to:

- Perform custom state migrations
- Clean up resources
- Log HMR events
- Handle complex state transitions

### Private class fields

Services are hot-reloaded through a generated proxy that forwards property
access to the current delegate instance. Native `#private` class fields and
methods only work when `this` is the exact instance that declared them, so
this plugin rewrites every native `#private` member declared in your app's
own source (on the service itself and any ancestor class it extends, as
long as that ancestor is also part of your app) to a plain, uniquely-named
property. An undecorated field is also made non-enumerable (via
`Object.defineProperty`), so it's hidden from `for...in`, `Object.keys`,
`JSON.stringify`, and spread — the same as a native `#private` member. A
private method already was non-enumerable, since class method syntax is
non-enumerable by default regardless of this rewrite. A
`@tracked #field` is the one exception: the decorator turns it into an
accessor on the prototype rather than an instance data property, so it's
left exactly as the plain rewrite produces it, enumerable or not according
to whatever `@tracked` itself does with an ordinary public field. In every
case this only emulates privacy: the member is reachable and writable from
outside via its generated name (e.g. through `Object.getOwnPropertyNames`,
`Reflect.ownKeys`, or devtools) — unlike a real native `#private` field. It's
obscured, not encapsulated, so don't rely on it as a serialization or
security boundary.

The one case this can't cover: a base class living in `node_modules` (never
processed by this plugin) that declares its own native `#private` fields.
A service extending such a class would still need `this` to be the real
instance to read those fields, so proxying that service could break. Ember's
own `Service`/`EmberObject`/`CoreObject` chain declares no native `#private`
fields, so ordinary Ember apps are unaffected.

## Installation

```
ember install ember-vite-hmr
```

## Usage

update your `vite.config.mjs` with

```js
import { hmr } from 'ember-vite-hmr';

plugins: [hmr()];
```

update you `babel.config.cjs`

```js
const { hotAstProcessor } = require('ember-vite-hmr/lib/babel-plugin');
plugins: [['ember-vite-hmr/lib/babel-plugin'], ...other];
```

and for `'babel-plugin-ember-template-compilation'`

```js
transforms: [...templateCompatSupport(), hotAstProcessor.transform],
```

## Contributing

See the [Contributing](CONTRIBUTING.md) guide for details.

## License

This project is licensed under the [MIT License](LICENSE.md).
