import { describe, expect, it, beforeEach, vi } from 'vitest';
import { hmr } from '../lib/hmr';
import { hmrImportMetadataCache } from '../lib/babel-plugin';

process.env.EMBER_VITE_HMR_ENABLED = 'true';

describe('hmr transform function', () => {
  let plugin: ReturnType<typeof hmr>;
  let mockContext: { resolve: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    hmrImportMetadataCache.clear();
    plugin = hmr(['development']);

    // Mock the plugin context
    mockContext = {
      resolve: vi.fn(async (id: string) => {
        // Mock resolution - return non-node_modules paths
        if (id.includes('node_modules')) {
          return { id: `/path/to/node_modules/${id}` };
        }
        return { id: `/app/${id}` };
      }),
    };

    // Configure the plugin
    plugin.configResolved({
      mode: 'development',
      command: 'serve',
    });
  });

  it('should extract __hmr_import_metadata__ using babel visitor', async () => {
    const source = `
import Component from '@glimmer/component';
import { precompileTemplate } from '@ember/template-compilation';
import { tracked } from '@glimmer/tracking';
import NamedComponent from 'my-components/named';
import SomeComponent from 'my-components/some';

let template__imports__ = null;

class _Imports {
  NamedComponent = NamedComponent;
  SomeComponent = SomeComponent;
}

template__imports__ = new _Imports();

export default precompileTemplate("template content", {
  scope: () => ({ template__imports__ })
});

export const __hmr_import_metadata__ = {
  importVar: "template__imports__",
  bindings: ["NamedComponent", "SomeComponent"]
};
`;

    const id = '/app/components/test-component.gjs';
    const result = await plugin.transform.call(mockContext, source, id);

    // Should contain hot reload code
    expect(result).toContain('if (import.meta.hot)');
    expect(result).toContain('import.meta.hot.accept');

    // Should NOT contain the metadata export anymore
    expect(result).not.toContain('export const __hmr_import_metadata__');
  });

  it('should handle multiple bindings in __hmr_import_metadata__', async () => {
    const source = `
import NamedComponent from 'my-components/named';
import SomeComponent from 'my-components/some';
import myhelper from 'my-helpers';

let template__imports__ = null;

class _Imports {
  NamedComponent = NamedComponent;
  SomeComponent = SomeComponent;
  myhelper = myhelper;
}

template__imports__ = new _Imports();

export const __hmr_import_metadata__ = {
  importVar: "template__imports__",
  bindings: ["NamedComponent", "SomeComponent", "myhelper"]
};
`;

    const id = '/app/components/multi-binding.gjs';
    const result = await plugin.transform.call(mockContext, source, id);

    // Should generate hot reload for each binding
    expect(result).toContain('if (import.meta.hot)');

    // Should remove metadata export
    expect(result).not.toContain('export const __hmr_import_metadata__');
  });

  it('should skip node_modules imports', async () => {
    const source = `
import Component from '@glimmer/component';
import ExternalComponent from 'some-addon/components/external';

let template__imports__ = null;

class _Imports {
  Component = Component;
  ExternalComponent = ExternalComponent;
}

template__imports__ = new _Imports();

export const __hmr_import_metadata__ = {
  importVar: "template__imports__",
  bindings: ["Component", "ExternalComponent"]
};
`;

    mockContext.resolve = vi.fn(async (id: string) => {
      if (
        id === '@glimmer/component' ||
        id === 'some-addon/components/external'
      ) {
        return { id: `/node_modules/${id}` };
      }
      return { id: `/app/${id}` };
    });

    const id = '/app/components/with-external.gjs';
    const result = await plugin.transform.call(mockContext, source, id);

    // Should still generate hot reload code but skip node_modules
    expect(result).toContain('if (import.meta.hot)');

    // Should remove metadata export
    expect(result).not.toContain('export const __hmr_import_metadata__');
  });

  it('should handle named imports correctly', async () => {
    const source = `
import { NamedComponent, OtherComponent } from 'my-components';

let template__imports__ = null;

class _Imports {
  NamedComponent = NamedComponent;
  OtherComponent = OtherComponent;
}

template__imports__ = new _Imports();

export const __hmr_import_metadata__ = {
  importVar: "template__imports__",
  bindings: ["NamedComponent", "OtherComponent"]
};
`;

    const id = '/app/components/named-imports.gjs';
    const result = await plugin.transform.call(mockContext, source, id);

    expect(result).toContain('if (import.meta.hot)');
    expect(result).not.toContain('export const __hmr_import_metadata__');
  });

  it('should not process files without __hmr_import_metadata__', async () => {
    const source = `
import Component from '@glimmer/component';

export default class MyComponent extends Component {
  // component code
}
`;

    const id = '/app/components/no-metadata.js';
    const result = await plugin.transform.call(mockContext, source, id);

    // Should return source unchanged (or with minimal changes)
    expect(result).not.toContain('if (import.meta.hot)');
    expect(result).not.toContain('import.meta.hot.accept');
  });

  it('should handle empty bindings array', async () => {
    const source = `
let template__imports__ = null;

export const __hmr_import_metadata__ = {
  importVar: "template__imports__",
  bindings: []
};
`;

    const id = '/app/components/empty-bindings.gjs';
    const result = await plugin.transform.call(mockContext, source, id);

    // Should remove metadata but not add hot reload code
    expect(result).not.toContain('export const __hmr_import_metadata__');
    expect(result).not.toContain('if (import.meta.hot)');
  });

  it('should handle default imports', async () => {
    const source = `
import MyComponent from 'my-components/my-component';

let template__imports__ = null;

class _Imports {
  MyComponent = MyComponent;
}

template__imports__ = new _Imports();

export const __hmr_import_metadata__ = {
  importVar: "template__imports__",
  bindings: ["MyComponent"]
};
`;

    const id = '/app/components/default-import.gjs';
    const result = await plugin.transform.call(mockContext, source, id);

    expect(result).toContain('if (import.meta.hot)');
    expect(result).toContain('import.meta.hot.accept');
    expect(result).not.toContain('export const __hmr_import_metadata__');
  });

  it('should not process when EMBER_VITE_HMR_ENABLED is false', async () => {
    process.env.EMBER_VITE_HMR_ENABLED = 'false';

    const source = `
export const __hmr_import_metadata__ = {
  importVar: "template__imports__",
  bindings: ["Component"]
};
`;

    const id = '/app/components/disabled.gjs';
    const result = await plugin.transform.call(mockContext, source, id);

    // Should return source unchanged
    expect(result).toBe(source);

    // Reset for other tests
    process.env.EMBER_VITE_HMR_ENABLED = 'true';
  });

  it('wires compat-modules HMR into the entry by its import (TS entry, folder != package name)', async () => {
    const source = `import compatModules from '@embroider/virtual/compat-modules';\n`;
    const id = '/repo/packages/frontend/app/app.ts';
    const result = await plugin.transform.call(mockContext, source, id);

    expect(result).toContain(
      "import.meta.hot.accept('@embroider/virtual/compat-modules'",
    );
    expect(result).toContain('compatModules[name] = module');
  });

  it('does not wire compat-modules HMR into modules that do not import it', async () => {
    const source = `export default class App {}\n`;
    const id = '/my-app/app/app.js';
    const result = await plugin.transform.call(mockContext, source, id);

    expect(result).not.toContain(
      "import.meta.hot.accept('@embroider/virtual/compat-modules'",
    );
  });

  it('should handle @embroider/virtual imports', async () => {
    const source = `
import Component from '@embroider/virtual/components/my-component';

let template__imports__ = null;

class _Imports {
  Component = Component;
}

template__imports__ = new _Imports();

export const __hmr_import_metadata__ = {
  importVar: "template__imports__",
  bindings: ["Component"]
};
`;

    const id = '/app/components/embroider-virtual.gjs';
    const result = await plugin.transform.call(mockContext, source, id);

    expect(result).toContain('if (import.meta.hot)');
    // Should replace @embroider/virtual with embroider_virtual in virtual path
    expect(result).toContain('embroider_virtual');
    expect(result).not.toContain('export const __hmr_import_metadata__');
  });

  it('uses hmrImportMetadataCache instead of re-parsing when a cache entry exists for the file', async () => {
    const id = '/app/components/cached-component.gjs';
    hmrImportMetadataCache.set(id, {
      importVar: 'template__imports__',
      bindings: ['NamedComponent'],
      importStatements: [
        {
          local: 'NamedComponent',
          source: 'my-components/named',
          specifier: 'default',
        },
      ],
    });

    // Deliberately omit __hmr_import_metadata__ from the source entirely --
    // if the transform had to fall back to parsing it back out of source
    // (the pre-cache behavior), this would produce no hot-reload wiring at
    // all, so a passing test here proves the cache is what's actually
    // driving the output, not a coincidental read of the source text.
    const source = `
import NamedComponent from 'my-components/named';

let template__imports__ = null;

class _Imports {
  NamedComponent = NamedComponent;
}

template__imports__ = new _Imports();
`;

    const result = await plugin.transform.call(mockContext, source, id);

    expect(result).toContain(
      "import.meta.hot.accept('/ember-vite-hmr/virtual/component:my-components/named::default.gjs'",
    );
    expect(result).toContain('template__imports__.NamedComponent = c.default;');
  });

  it('prefers hmrImportMetadataCache over a stale __hmr_import_metadata__ export left in source', async () => {
    const id = '/app/components/stale-metadata.gjs';
    hmrImportMetadataCache.set(id, {
      importVar: 'template__imports__',
      bindings: ['FreshComponent'],
      importStatements: [
        {
          local: 'FreshComponent',
          source: 'my-components/fresh',
          specifier: 'default',
        },
      ],
    });

    // The __hmr_import_metadata__ export text below deliberately disagrees
    // with the cache entry above (different binding). A correct
    // cache-first implementation must ignore it entirely.
    const source = `
import FreshComponent from 'my-components/fresh';

let template__imports__ = null;

export const __hmr_import_metadata__ = {
  importVar: "template__imports__",
  bindings: ["StaleComponent"]
};
`;

    const result = await plugin.transform.call(mockContext, source, id);

    expect(result).toContain(
      "import.meta.hot.accept('/ember-vite-hmr/virtual/component:my-components/fresh::default.gjs'",
    );
    expect(result).not.toContain('StaleComponent');
    expect(result).not.toContain('export const __hmr_import_metadata__');
  });

  it('gates HMR scaffolding on command, not just mode', () => {
    const buildPlugin = hmr(['development']);

    buildPlugin.configResolved({ mode: 'development', command: 'build' });
    expect(process.env.EMBER_VITE_HMR_ENABLED).toBe('false');

    buildPlugin.configResolved({ mode: 'development', command: 'serve' });
    expect(process.env.EMBER_VITE_HMR_ENABLED).toBe('true');
  });
});
