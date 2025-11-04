import { describe, expect, it, beforeEach, vi } from 'vitest';
import { hmr } from '../lib/hmr';

process.env['EMBER_VITE_HMR_ENABLED'] = 'true';

describe('hmr transform function', () => {
  let plugin: any;
  let mockContext: any;

  beforeEach(() => {
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
      if (id === '@glimmer/component' || id === 'some-addon/components/external') {
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
    process.env['EMBER_VITE_HMR_ENABLED'] = 'false';
    
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
    process.env['EMBER_VITE_HMR_ENABLED'] = 'true';
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
});