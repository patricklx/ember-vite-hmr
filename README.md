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
