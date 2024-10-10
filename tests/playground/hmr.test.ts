import util from 'node:util';
import { expect, test, describe, beforeAll, beforeEach } from 'vitest';
import {
  ensureDir,
  readFile,
  pathExistsSync,
  writeFile,
  emptyDir,
} from 'fs-extra';
import { join, dirname, resolve } from 'path';
import * as process from 'node:process';
import { startVite } from '../utils';

const execAsync = util.promisify(require('child_process').exec);
const execa = (...args) => {
  const promise = execAsync(...args);
  const child = promise.child;
  child.stdout.on('data', function (data) {
    console.log(data);
  });
  child.stderr.on('data', function (data) {
    console.log('stderr: ' + data);
  });
  child.on('close', function (code) {
    console.log('closing code: ' + code);
  });
  return promise;
};

describe('hmr tests', () => {
  let endpoint = '';
  let page;
  const tmpDir = resolve('./tmp');
  const appName = 'my-fancy-app';
  let appDir = resolve(tmpDir, appName);
  let viteContext: any;

  async function waitForMessage(withText: string | RegExp) {
    return new Promise((resolve, reject) => {
      let t = setTimeout(() => {
        console.log(
          `waitForMessage '${withText}' time out, messages`,
          viteContext.messages.map((m) => m),
        );
        reject(new Error('time out'));
      }, 3 * 1000);
      function check() {
        if (!t) return;
        console.log('check', viteContext.messages, withText);
        const hasPageReload = viteContext.messages.find((m) => m.includes('page reload'));
        if (hasPageReload) {
          throw new Error('page reload detected');
        }
        const m = viteContext.messages.find((m) =>
          withText instanceof RegExp ? withText.test(m) : m.includes(withText),
        );
        if (m) {
          const i = viteContext.messages.indexOf(m);
          viteContext.messages.splice(0, i + 1);
          clearTimeout(t);
          t = null;
          resolve(m);
        }
      }
      check();
      viteContext.onMessage(check);
    });
  }

  class EditFile<T = void> {
    location: string;
    tasks: (() => Promise<void>)[] = [];

    then<TResult1 = T, TResult2 = never>(
      onfulfilled?:
        | ((value: T) => TResult1 | PromiseLike<TResult1>)
        | undefined
        | null,
      onrejected?:
        | ((reason: any) => TResult2 | PromiseLike<TResult2>)
        | undefined
        | null,
    ): PromiseLike<TResult1 | TResult2>;

    async then(
      resolve: () => void,
      reject: (reason: Error) => void,
    ): Promise<void> {
      try {
        for (const task of this.tasks) {
          await task();
        }
        console.log(this.location);
        console.log((await readFile(this.location)).toString());
        this.tasks = [];
        // wait a bit
        await new Promise((resolve) => setTimeout(resolve, 100));
        resolve();
      } catch (e) {
        reject(e as Error);
      }
    }

    constructor(location: string) {
      this.location = location;
    }

    setContent(content: string) {
      const run = async () => {
        await ensureDir(dirname(this.location));
        await writeFile(this.location, content);
      };
      this.tasks.push(run);
      return this;
    }

    insert(content: string) {
      const run = async () => {
        let code = (await readFile(this.location)).toString();
        code = content + code;
        await writeFile(this.location, code);
      };
      this.tasks.push(run);
      return this;
    }

    replaceCode(code: string | RegExp, replaceWith: string) {
      const run = async () => {
        let content = (await readFile(this.location)).toString();
        content = content.replace(code, replaceWith);
        await writeFile(this.location, content);
      };
      this.tasks.push(run);
      return this;
    }
  }

  function editFile(path: string) {
    const location = resolve(appDir, path);
    return new EditFile(location);
  }

  beforeEach(() => {
    viteContext.messages.length = 0;
  });

  beforeAll(
    async () => {
      if (!pathExistsSync(tmpDir) || !process.env.REUSE) {
        await ensureDir(tmpDir);
        await emptyDir(tmpDir);
        console.log('install to', tmpDir);
        await execa(
          `npx ember-cli@latest new ${appName} -b @embroider/app-blueprint --pnpm`,
          {
            cwd: tmpDir,
            stdio: 'inherit',
          },
        );

        await editFile('./babel.config.cjs')
          .insert(
            "\nconst { hotAstProcessor } = require('ember-vite-hmr/lib/babel-plugin');\n",
          )
          .replaceCode(
            'plugins: [',
            'plugins: [[\n' +
              "      'ember-vite-hmr/lib/babel-plugin'\n" +
              '    ],',
          )
          .replaceCode(
            '...templateCompatSupport()',
            '...templateCompatSupport(), hotAstProcessor.transform',
          )
          .replaceCode(
            "require.resolve('decorator-transforms/runtime')",
            "'decorator-transforms/runtime'",
          );

        await editFile('./vite.config.mjs')
          .insert("\nimport { hmr } from 'ember-vite-hmr';\n")
          .replaceCode('contentFor(),', 'contentFor(),\n    hmr(),\n');
      }

      await execa('pnpm build', {
        stdio: 'inherit',
      });

      await execa(`pnpm i --save-dev ../../`, {
        cwd: appDir,
        stdio: 'inherit',
      });

      await execa(
        `pnpm i --save-dev decorator-transforms @babel/plugin-transform-runtime babel-plugin-ember-template-compilation`,
        {
          cwd: appDir,
          stdio: 'inherit',
        },
      );

      await editFile('./app/templates/application.hbs').setContent(
        '<WelcomePage /><TestComponent />',
      );

      await editFile('./app/components/test-component.gjs').setContent(`
    import * as runtime from 'decorator-transforms/runtime';
    import Component from "@glimmer/component";
    
    console.log(runtime);

    export default class MyComponent extends Component {
      <template>
        Test Component
      </template>
    }
    `);

      viteContext = await startVite({
        cwd: appDir,
      });
      endpoint = viteContext.baseUri;
      page = viteContext.page;
    },
    2 * 60 * 1000,
  );

  test('should render', async () => {
    const body = await page.waitForSelector('#ember-welcome-page-id-selector');
    const bodyContent = await body.evaluate((el) => el.textContent);
    expect(bodyContent, bodyContent).toContain('Congratulations, you made it!');
  });

  test('should update routes', async () => {
    await editFile('./app/templates/application.hbs').setContent(
      '<TestComponent />',
    );
    await waitForMessage('hmr update /app/templates/application.hbs');
    await waitForMessage('hot updated: /app/templates/application.hbs');
    const body = await page.waitForSelector('.ember-application');
    const bodyContent = await body.evaluate((el) => el.textContent);
    expect(bodyContent, bodyContent).toContain('Test Component');
  });

  test('should hmr', { timeout: 10000 }, async () => {
    await editFile('./app/components/test-component.gjs').setContent(`
    import Component from "@glimmer/component";

    export default class MyComponent extends Component {
      <template>
      <div class='hmr'>
        Test Component HMR
      </div>
      </template>
    }
    `);
    const body = await page.waitForSelector('.hmr');
    const bodyContent = await body.evaluate((el) => el.textContent);
    expect(bodyContent, bodyContent).toContain('Test Component HMR');
  });

  test('should forward yields', async () => {
    await editFile('./app/templates/application.hbs').setContent(`
        <TestComponent>
            <:default as |txt|>{{txt}}</:default>    
            <:named as |txt|>{{txt}}</:named>    
        </TestComponent>`);
    await waitForMessage('hmr update /app/templates/application.hbs');
    await waitForMessage('hot updated: /app/templates/application.hbs');

    await editFile('./app/components/test-component.gjs').setContent(`
    import Component from "@glimmer/component";

    export default class MyComponent extends Component {
      <template>
        <div class='yields'>
          {{yield 'yield from test component'}}
          {{yield 'yield to named from test component' to='named'}}
        </div>        
      </template>
    }
    `);
    await waitForMessage('hmr update /app/templates/application.hbs');
    const body = await page.waitForSelector('.yields');
    const bodyContent = await body.evaluate((el) => el.textContent);
    expect(bodyContent, bodyContent).toContain('yield from test component');
    expect(bodyContent, bodyContent).toContain(
      'yield to named from test component',
    );
  });

  test('should hmr with state', { timeout: 10 * 1000 }, async () => {
    await editFile('./app/components/foo-component.gjs').setContent(`
    import Component from "@glimmer/component";

    export default class MyComponent extends Component {
      count = 1;
      <template>
        <div class='hmr-state'>
          count: {{this.count}}
        </div>        
      </template>
    }
    `);

    await editFile('./app/components/test-component.gjs').setContent(`
    import Component from "@glimmer/component";
    import FooComponent from "./foo-component.gjs";

    export default class MyComponent extends Component {
      <template>
        <FooComponent />
      </template>
    }
    `);
    await waitForMessage('hot updated: /app/components/test-component.gjs');
    let body = await page.waitForSelector('.hmr-state');
    let bodyContent = await body.evaluate((el) => el.textContent);
    expect(bodyContent, bodyContent).toContain('count: 1');

    await editFile('./app/components/foo-component.gjs').setContent(`
    import Component from "@glimmer/component";

    export default class MyComponent extends Component {
      count = 2;
      <template>
        <div class='count'>
          count still 1: {{this.count}}
        </div>        
      </template>
    }
    `);
    await waitForMessage(
      'hmr update /app/components/test-component.gjs, /ember-vite-hmr/virtual/component:/app/components/foo-component.gjs:default.gjs',
    );
    body = await page.waitForSelector('.count');
    bodyContent = await body.evaluate((el) => el.textContent);
    expect(bodyContent, bodyContent).toContain('count still 1: 1');
  });

  test('should hmr with controller state', async () => {
    await editFile('./app/templates/application.hbs').setContent(
      '<TestComponent @controller={{this}} />',
    );
    await waitForMessage('hmr update /app/templates/application.hbs');
    await waitForMessage('hot updated: /app/templates/application.hbs');

    await editFile('./app/components/test-component.gjs').setContent(`
    
    import Component from "@glimmer/component";
    import FooComponent from "./foo-component.gjs";

    export default class MyComponent extends Component {

      didInsert = () => {
        this.args.controller.test = (this.args.controller.test ?? 0) + 1;
      }

      <template>
        <div class='hmr-controller-state'>
          {{this.didInsert}}
          hi {{@controller.test}}
        </div>        
      </template>
    }`);

    let body = await page.waitForSelector('.hmr-controller-state');
    let bodyContent = await body.evaluate((el) => el.textContent);
    expect(bodyContent, bodyContent).toContain('hi 1');

    await editFile('./app/components/test-component.gjs').setContent(`
    
    import Component from "@glimmer/component";
    import FooComponent from "./foo-component.gjs";

    export default class MyComponent extends Component {

      didInsert = () => {
        this.args.controller.test = (this.args.controller.test ?? 0) + 1;
      }

      <template>
        {{this.didInsert}}
        hi2 {{@controller.test}}
      </template>
    }`);

    await waitForMessage('hot updated: /app/components/test-component.gjs');
    body = await page.waitForSelector('.ember-application');
    bodyContent = await body.evaluate((el) => el.textContent);
    expect(bodyContent, bodyContent).toContain('hi2 2');
  });
});
