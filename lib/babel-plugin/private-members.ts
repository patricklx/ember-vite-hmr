import type * as BabelTypesNamespace from '@babel/types';
import type * as Babel from '@babel/core';

function hasPrivateMembers(classBody: BabelTypesNamespace.ClassBody): boolean {
  return classBody.body.some(
    (member) =>
      member.type === 'ClassPrivateProperty' ||
      member.type === 'ClassPrivateMethod',
  );
}

// The generated HMR proxy (see service-proxy.ts's `ctorBody`) reads and
// writes service state through a Proxy whose `get`/`set` traps forward to a
// separately constructed delegate instance. Native `#private` fields can
// only ever be accessed with `this` bound to the exact object that declared
// them, and a method called as `proxy.method()` runs with `this` set to the
// proxy, not the delegate -- so a `#private` field read from ANY function
// reached through the proxy (a prototype method or a plain own-property
// function assigned in the constructor) would throw "Cannot read private
// member ... from an object whose class did not declare it" once called
// through it. An earlier version of this proxy special-cased prototype
// methods by `.bind()`-ing them to the delegate, but that's exactly
// backwards for an own-property function value: `bind()` returns a fresh
// function object, silently dropping any metadata identity-sensitive code
// associates with the original one via a WeakMap (e.g.
// `modifier()`/`helper()`, `setComponentManager` -- see #560/#561).
//
// Rewriting `#foo` to a plain, uniquely-named, non-computed property
// sidesteps the whole problem instead: an ordinary property reads and
// writes correctly through the proxy's existing traps no matter what `this`
// is at the call site, so no per-property binding is needed at all. This
// runs generically on *every* class the app's own source defines (see the
// `Class` visitor in ../../babel-plugin.ts), not just service classes, so it
// also covers `#private` fields on an ancestor class the service extends,
// as long as that ancestor is part of the app's own source (and therefore
// passes through this same babel pass). It does NOT help with a `#private`
// field declared on an ancestor class that lives in `node_modules` -- that
// file is never passed through this transform, so its fields stay fully
// native, and a prototype method inherited from it would still crash if
// called through the proxy. Ember's own `Service`/`EmberObject`/`CoreObject`
// chain declares no native `#private` fields, so this doesn't affect normal
// Ember apps; a third-party base class that does would need to stop using
// native `#private` fields, or avoid extending it directly with an
// HMR-proxied service.
//
// A Symbol-keyed property (an earlier version of this rewrite) would keep
// the member non-enumerable, closer to real privacy, but Ember's `@tracked`
// rejects it outright: `@glimmer/tracking`'s decorator entry point
// distinguishes "I was invoked as a native decorator" from "I was invoked as
// `tracked({...})`" by checking `typeof key === 'string'` (see
// `isElementDescriptor` in `@ember/-internals`), so a `@tracked #count = 0`
// field renamed to a Symbol key silently falls through to the wrong branch
// and never tracks at all (verified empirically: reads back `undefined`,
// writes throw "Cannot assign to read only property"). A plain string key
// satisfies that check and lets `@tracked`/`decorator-transforms` treat the
// member exactly like an ordinary public tracked field -- including
// surviving the HMR accept handler's `for (const key in oldDelegate)` state
// sync loop the same way any other tracked field does, which a Symbol key
// (invisible to `for...in`) could never do anyway.
//
// The one thing a generated name can't be checked against is a private
// member of the *same name* declared by an ancestor/subclass living in a
// different file (each file's uid generation only sees its own bindings) --
// deliberately not solved here, since the `hmrPriv<Name>` prefix makes a
// same-name collision across unrelated classes exceedingly unlikely in
// practice, and the alternative (whole-program cross-file analysis) is out
// of proportion to that risk.
export function renamePrivateClassMembers(
  babel: typeof Babel,
  classPath: Babel.NodePath<
    BabelTypesNamespace.ClassDeclaration | BabelTypesNamespace.ClassExpression
  >,
  programPath: Babel.NodePath<BabelTypesNamespace.Program>,
): void {
  const t = babel.types;
  if (!hasPrivateMembers(classPath.node.body)) {
    return;
  }

  // `renamedNames` tracks which private member names get rewritten so the
  // reference-rewriting traversal below only touches references to *this*
  // class's own renamed members (see the `classPath.traverse` call further
  // down).
  const renamedNames = new Set<string>();
  for (const member of classPath.node.body.body) {
    if (
      member.type === 'ClassPrivateProperty' ||
      member.type === 'ClassPrivateMethod'
    ) {
      renamedNames.add(member.key.id.name);
    }
  }

  // Existing (non-computed, identifier-keyed) member names in this class's
  // own body, so a generated replacement name can never collide with an
  // unrelated member already declared here.
  const usedNames = new Set<string>();
  for (const member of classPath.node.body.body) {
    const key = (member as { key?: BabelTypesNamespace.Node }).key;
    const computed = (member as { computed?: boolean }).computed;
    if (key && !computed && t.isIdentifier(key)) {
      usedNames.add(key.name);
    }
  }

  const newNames = new Map<string, string>();
  const getNewName = (name: string): string => {
    let known = newNames.get(name);
    if (known) {
      return known;
    }
    const base = `hmrPriv${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    let candidate: string;
    do {
      candidate = programPath.scope.generateUidIdentifier(base).name;
    } while (usedNames.has(candidate));
    usedNames.add(candidate);
    newNames.set(name, candidate);
    return candidate;
  };

  // Rename the class's own private declarations directly off the body
  // array -- not via `classPath.traverse` -- so a nested class's own
  // (unrelated, possibly same-named) private declarations are never
  // touched: they simply aren't in this array.
  for (const memberPath of classPath.get('body').get('body')) {
    if (memberPath.isClassPrivateProperty()) {
      const node = memberPath.node;
      memberPath.replaceWith(
        t.classProperty(
          t.identifier(getNewName(node.key.id.name)),
          node.value,
          node.typeAnnotation,
          node.decorators,
          false,
          node.static,
        ),
      );
    } else if (memberPath.isClassPrivateMethod()) {
      const node = memberPath.node;
      const replacement = t.classMethod(
        node.kind,
        t.identifier(getNewName(node.key.id.name)),
        node.params,
        node.body,
        false,
        node.static,
        node.generator,
        node.async,
      );
      // `t.classMethod`'s builder has no `decorators` parameter -- has to be
      // assigned after the fact or a decorated private method (e.g. `@action
      // #foo() {}`) would silently lose its decorator in the rewrite.
      replacement.decorators = node.decorators;
      memberPath.replaceWith(replacement);
    }
  }

  // A private name reference found inside a nested class only actually
  // belongs to `classPath`'s own renamed declaration if no closer-enclosing
  // class *redeclares* the same name -- private names resolve to the
  // nearest enclosing class that declares them, same as any other lexical
  // scoping, so a nested class legitimately shadowing `#secret` with its
  // own `#secret` must keep referencing its own (native, untouched) field.
  const declaresOwnPrivate = (
    cls:
      | BabelTypesNamespace.ClassDeclaration
      | BabelTypesNamespace.ClassExpression,
    name: string,
  ): boolean =>
    cls.body.body.some(
      (member) =>
        (member.type === 'ClassPrivateProperty' ||
          member.type === 'ClassPrivateMethod') &&
        member.key.id.name === name,
    );

  const referenceBelongsToOuterClass = (
    path: Babel.NodePath<BabelTypesNamespace.Node>,
    name: string,
  ): boolean => {
    let enclosing = path.findParent((p) => p.isClass());
    while (enclosing) {
      if (enclosing.node === classPath.node) {
        return true;
      }
      if (
        declaresOwnPrivate(
          enclosing.node as
            | BabelTypesNamespace.ClassDeclaration
            | BabelTypesNamespace.ClassExpression,
          name,
        )
      ) {
        return false;
      }
      enclosing = enclosing.findParent((p) => p.isClass());
    }
    return false;
  };

  // Rewrite *references* to the just-renamed names anywhere within the
  // class, including inside nested classes/closures. Private names are
  // lexically scoped to their enclosing class body, not to the file, so
  // code legally references an outer class's private field from inside a
  // nested class via a captured `this` (e.g. a factory method that builds
  // and returns a class closing over `self.#secret`). Blanket-skipping
  // traversal into nested classes -- as an earlier version of this
  // function did -- left such references as native `#foo` PrivateNames
  // while the outer declaration was renamed to a Symbol, producing invalid
  // output ("Private field must be declared in an enclosing class").
  classPath.traverse({
    'MemberExpression|OptionalMemberExpression'(
      path: Babel.NodePath<
        | BabelTypesNamespace.MemberExpression
        | BabelTypesNamespace.OptionalMemberExpression
      >,
    ) {
      const property = path.node.property;
      if (
        t.isPrivateName(property) &&
        renamedNames.has(property.id.name) &&
        referenceBelongsToOuterClass(path, property.id.name)
      ) {
        path.node.property = t.identifier(getNewName(property.id.name));
        path.node.computed = false;
      }
    },
    BinaryExpression(
      path: Babel.NodePath<BabelTypesNamespace.BinaryExpression>,
    ) {
      const left = path.node.left;
      if (
        path.node.operator === 'in' &&
        t.isPrivateName(left) &&
        renamedNames.has(left.id.name) &&
        referenceBelongsToOuterClass(path, left.id.name)
      ) {
        path.node.left = t.stringLiteral(getNewName(left.id.name));
      }
    },
  });
}
