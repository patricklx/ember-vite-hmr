import type * as BabelTypesNamespace from '@babel/types';
import type * as Babel from '@babel/core';
import { ImportUtil } from 'babel-import-util';

// Rewrites `export default class MyService extends Service { ... }` (or the
// equivalent separate-declaration form) into a generated `...HmrProxy` class
// that's exported in its place. The proxy keeps a stable identity for
// Ember's container/injections while the actual state-bearing instance --
// the "delegate" -- gets swapped underneath on every HMR accept, which is
// what lets a service's field/method edits apply without a full page
// reload. Private members on the original class (and any of its ancestors
// in the app's own source) are rewritten separately by
// `renamePrivateClassMembers` (see ../private-members.ts) before this runs,
// so this function doesn't need to special-case them at all.
export function transformServiceExport(
  babel: typeof Babel,
  path: Babel.NodePath<BabelTypesNamespace.ExportDefaultDeclaration>,
  state: Babel.PluginPass,
): void {
  const t = babel.types;

  // Check if this is a service file (normalize path for cross-platform compatibility)
  const normalizedFilename = state.filename?.replace(/\\/g, '/');
  if (!normalizedFilename?.includes('/services/')) {
    return;
  }

  const declaration = path.node.declaration;

  // Handle both inline class declaration and identifier reference
  let classDeclaration: BabelTypesNamespace.ClassDeclaration | null = null;
  let classIdentifier: BabelTypesNamespace.Identifier | null = null;
  let classPath: Babel.NodePath<BabelTypesNamespace.ClassDeclaration> | null =
    null;

  if (declaration.type === 'ClassDeclaration' && declaration.id) {
    // Case 1: export default class MyService extends Service { ... }
    classDeclaration = declaration;
    classIdentifier = declaration.id;
    classPath = path.get(
      'declaration',
    ) as Babel.NodePath<BabelTypesNamespace.ClassDeclaration>;
  } else if (declaration.type === 'Identifier') {
    // Case 2: class MyService extends Service { ... } \n export default MyService;
    const binding = path.scope.getBinding(declaration.name);
    if (binding && binding.path.isClassDeclaration()) {
      classDeclaration = binding.path
        .node as BabelTypesNamespace.ClassDeclaration;
      classIdentifier = classDeclaration.id;
      classPath =
        binding.path as Babel.NodePath<BabelTypesNamespace.ClassDeclaration>;
    }
  }

  if (!classDeclaration || !classIdentifier || !classPath) {
    return;
  }

  if (classIdentifier.name.endsWith('HmrProxy')) {
    return;
  }

  // Check if it extends Service
  const superClass = classDeclaration.superClass;
  if (
    !superClass ||
    ((superClass.type !== 'Identifier' || superClass.name !== 'Service') &&
      superClass.type !== 'MemberExpression')
  ) {
    return;
  }

  // Get the program path for ImportUtil
  const programPath = path.findParent((p) =>
    p.isProgram(),
  ) as Babel.NodePath<BabelTypesNamespace.Program>;
  if (!programPath) {
    return;
  }

  // Private members are renamed generically by the `Class` visitor in
  // ../../babel-plugin.ts, not here -- it runs on every class regardless of
  // whether it ends up wrapped by this HMR proxy.

  const util = new ImportUtil(babel, programPath);
  const tracked = util.import(programPath, '@glimmer/tracking', 'tracked');
  const Service = util.import(programPath, '@ember/service', 'default');

  const originalClassName = classIdentifier.name;
  const proxyClassName = `${originalClassName}HmrProxy`;

  // Keep the original class as-is, just remove it from export
  // We'll add it back as a non-exported class

  const babelTemplate = (babel as typeof import('@babel/core')).template;

  // The live proxy instance and the latest accepted implementation must
  // live on `import.meta.hot.data`, not in a module-scope `let`: Vite
  // guarantees that object (and only that object) survives across a
  // module's hot re-evaluations. A component's `@service` injection can
  // end up constructing the proxy against a *later* re-evaluation of
  // this module than the one whose `import.meta.hot.accept` closure
  // captured a module-scope variable — the closure and the constructor
  // would then silently operate on two disconnected variable bindings
  // (a duplicate-module symptom), and the HMR swap would never reach
  // the instance actually rendered.
  const ctorBody = babelTemplate.statements(
    `
      super(...args);
      this._owner = args[0];
      const Impl = (import.meta.hot && import.meta.hot.data._impl) || ${proxyClassName}.Impl;
      this._delegate = new Impl(this._owner);
      if (import.meta.hot) {
        import.meta.hot.data._proxy = this;
      }
      return new Proxy(this, {
        get(target, prop, receiver) {
          if (prop === '_delegate') {
            return target._delegate;
          }
          // A subclass of this service (see the Reflect.get fallback
          // below) may override a method the base delegate class also
          // defines. Since 'prop in delegate' walks the delegate's
          // *entire* prototype chain, it would match the base
          // implementation before the subclass's own override ever
          // gets a chance -- so look for an own property between
          // target's dynamic prototype and this proxy's own prototype
          // first, and prefer it over the delegate.
          let proto = Object.getPrototypeOf(target);
          while (proto && proto !== ${proxyClassName}.prototype) {
            if (Object.prototype.hasOwnProperty.call(proto, prop)) {
              return Reflect.get(target, prop, receiver);
            }
            proto = Object.getPrototypeOf(proto);
          }
          const delegate = target._delegate;
          // Function-valued properties are returned exactly as stored
          // on the delegate, never bound. Binding used to be necessary
          // for prototype methods reading native '#private' fields
          // (private-field access requires 'this' to literally be the
          // declaring instance), but the private-member rewrite below
          // now rewrites every '#private' member the app's own source
          // declares to a plain property, which reads correctly
          // through this same trap regardless of what 'this' is at
          // the call site -- so a bound copy is never needed for that
          // case. Binding would also be actively wrong for
          // identity-sensitive own-property function values
          // (modifier()/helper() results, component classes, etc.),
          // since bind() returns a fresh function object and silently
          // drops any metadata associated with the original one via a
          // WeakMap (see #560/#561).
          //
          // Calling a returned prototype method as 'service.method()'
          // now runs it with 'this' set to the proxy (standard
          // member-call semantics), not the raw delegate -- the same
          // way own-property function values have always run here.
          // Reflection idioms inside such a method (Object.keys(this),
          // 'this instanceof OriginalClass', for-in over this)
          // therefore see the proxy's own shape, not the delegate's --
          // a pre-existing limitation for own-property functions, now
          // also true for prototype methods. Nothing in this repo's
          // services relies on that, and ember-source's own
          // Service/EmberObject/CoreObject chain declares no native
          // '#private' fields, so this is safe for the common case;
          // a third-party base class outside the app's own source that
          // both uses native '#private' fields AND relies on such
          // reflection from a service method would still be affected.
          if (prop in delegate) {
            return delegate[prop];
          }
          // Not on the delegate: fall through to the proxy's own real
          // prototype chain, which covers methods declared on a subclass
          // of this service (the subclass never went through this babel
          // transform itself, since it doesn't extend Service directly).
          return Reflect.get(target, prop, receiver);
        },
        set(target, prop, value) {
          target._delegate[prop] = value;
          return true;
        },
        defineProperty(target, prop, descriptor) {
          // A subclass's own class fields are installed via
          // [[DefineOwnProperty]] against whatever 'this' super() returned
          // (this proxy), bypassing the 'set' trap entirely. Route them to
          // the delegate too, so subclass state lives alongside the rest
          // of the service's state instead of stranded on the proxy target.
          return Reflect.defineProperty(target._delegate, prop, descriptor);
        },
      });
    `,
  )() as BabelTypesNamespace.Statement[];

  const willDestroyBody = babelTemplate.statements(
    `
      super.willDestroy();
      this._delegate.willDestroy();
      if (import.meta.hot && import.meta.hot.data._proxy === this) {
        import.meta.hot.data._proxy = undefined;
      }
    `,
  )() as BabelTypesNamespace.Statement[];

  // Create the HMR proxy service class
  const proxyClass = t.classDeclaration(
    t.identifier(proxyClassName),
    Service,
    t.classBody([
      // static Impl = OriginalService (reference to the original class)
      t.classProperty(
        t.identifier('Impl'),
        t.identifier(originalClassName),
        null,
        null,
        false,
        true,
      ),
      // @tracked _delegate
      t.classProperty(
        t.identifier('_delegate'),
        null,
        null,
        [t.decorator(tracked)],
        false,
        false,
      ),
      t.classMethod(
        'constructor',
        t.identifier('constructor'),
        [t.restElement(t.identifier('args'))],
        t.blockStatement(ctorBody),
      ),
      t.classMethod(
        'method',
        t.identifier('willDestroy'),
        [],
        t.blockStatement(willDestroyBody),
      ),
    ]),
  );

  // For Case 1 (inline class), we need to keep the class as non-exported
  // For Case 2 (separate declaration), the class already exists, so we don't recreate it
  if (declaration.type === 'ClassDeclaration') {
    // Case 1: Inline class export - create a non-exported version
    const originalClass = t.classDeclaration(
      classIdentifier,
      classDeclaration.superClass,
      classDeclaration.body,
      classDeclaration.decorators || [],
    );

    // Replace the export with all the necessary declarations
    // IMPORTANT: Class must be declared BEFORE the proxy class that references it
    path.replaceWithMultiple([
      originalClass, // The original class (no longer exported) - MUST BE FIRST
      t.exportDefaultDeclaration(proxyClass), // Export the proxy class
    ]);
  } else {
    // Case 2: Separate declaration - class already exists, just replace the export
    path.replaceWithMultiple([
      t.exportDefaultDeclaration(proxyClass), // Export the proxy class
    ]);
  }

  // Add HMR code after the export using babel template
  if (programPath) {
    const hmrCode = `
      if (import.meta.hot) {
        import.meta.hot.accept((newModule) => {
          const NewImpl = newModule?.default?.Impl;
          if (!NewImpl) {
            return;
          }

          // Remember the latest accepted implementation so a proxy
          // constructed *after* this update (its instantiation raced
          // behind the HMR swap) still picks up the new class instead
          // of the stale one captured at module-evaluation time.
          import.meta.hot.data._impl = NewImpl;

          const proxy = import.meta.hot.data._proxy;
          if (!proxy) {
            // No instance has been created yet; the next construction
            // will read import.meta.hot.data._impl above.
            return;
          }

          const oldDelegate = proxy._delegate;
          const newDelegate = new NewImpl(proxy._owner);
          proxy._delegate = newDelegate;

          // Sync state from old to new while keeping new implementation defaults.
          // Keys come from both 'for...in' (own AND inherited enumerable
          // properties -- this is what picks up a '@tracked' field, which
          // decorator-transforms implements as an *enumerable* accessor pair
          // on the prototype, not an own instance property) and
          // Object.getOwnPropertyNames (own properties regardless of
          // enumerability -- this is what picks up an undecorated private
          // field, which the private-member rewrite in
          // ../private-members.ts's hideRenamedProperties makes a
          // non-enumerable own property specifically so it's invisible to
          // 'for...in', 'Object.keys', etc. everywhere *except* here). Using
          // only 'for...in' would silently drop such a field's live,
          // runtime-mutated value on every hot-reload, resetting it to
          // whatever the new module's field initializer produces.
          const keysToSync = new Set();
          for (const key in oldDelegate) {
            keysToSync.add(key);
          }
          for (const key of Object.getOwnPropertyNames(oldDelegate)) {
            keysToSync.add(key);
          }
          for (const key of keysToSync) {
            const descriptor =
              Object.getOwnPropertyDescriptor(oldDelegate, key) ||
              Object.getOwnPropertyDescriptor(Object.getPrototypeOf(oldDelegate), key);
            const hasOwnDefault = Object.prototype.hasOwnProperty.call(newDelegate, key);
            const currentValue = newDelegate[key];
            const previousValue = oldDelegate[key];

            // Skip Service instances - they should not be synced
            if (previousValue instanceof Service) {
              continue;
            }

            // Skip function properties that the new implementation also
            // declares (a fresh redefinition should win over the old
            // one). But a function-valued property the new
            // implementation *doesn't* declare at all isn't a stale
            // redefinition -- it's state a subclass installed on the
            // delegate directly (subclasses of this service never go
            // through this transform themselves, since their
            // superclass isn't literally named Service; their own
            // class fields land on the delegate via the proxy's
            // defineProperty trap instead). Dropping it here would
            // silently break e.g. an arrow-function class field on a
            // subclass across a base-class HMR swap.
            if (typeof previousValue === 'function' && hasOwnDefault) {
              continue;
            }

            const shouldSync =
              !!descriptor &&
              (descriptor.writable || descriptor.set || Object.prototype.hasOwnProperty.call(oldDelegate, key)) &&
              (!hasOwnDefault || currentValue === previousValue);

            if (shouldSync) {
              try {
                newDelegate[key] = previousValue;
              } catch (e) {
                // Skip non-writable properties
              }
            }
          }

          newDelegate._hmrAccepted?.(oldDelegate);

          if (oldDelegate.willDestroy) {
            oldDelegate.willDestroy();
          }
        });
      }
    `;

    const template = (
      babel as typeof import('@babel/core')
    ).template.statements(hmrCode);
    (programPath as Babel.NodePath<BabelTypesNamespace.Program>).pushContainer(
      'body',
      template(),
    );
  }
}
