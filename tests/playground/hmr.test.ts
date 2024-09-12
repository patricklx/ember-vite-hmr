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

const execa = util.promisify(require('child_process').exec);

describe('hmr tests', () => {
  let endpoint = '';
  let page;
  const tmpDir = resolve('./tmp');
  const appName = 'my-fancy-app';
  let appDir = resolve(tmpDir, appName);
  let viteContext: any;

  async function waitForMessage(withText: string | RegExp) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        console.log(
          `waitForMessage '${withText}' time out, messages`,
          viteContext.messages.map((m) => m),
        );
        reject(new Error('time out'));
      }, 3 * 1000);
      function check() {
        console.log('check', viteContext.messages, withText);
        console.log(
          'check',
          viteContext.messages[0]?.includes(withText),
          withText,
        );
        const m = viteContext.messages.find((m) =>
          withText instanceof RegExp ? withText.test(m) : m.includes(withText),
        );
        console.log('found', m);
        if (m) {
          console.log('clearTimeout');
          clearTimeout(t);
          console.log('resolve');
          resolve(m);
        }
      }
      check();
      viteContext.onMessage(check);
    });
  }

  interface EditFile {
    // @ts-ignore
    then?: PromiseLike<any>['then'];
  }

  class EditFile {
    location: string;
    tasks = [];

    // @ts-ignore
    async then(resolve, reject) {
      try {
        for (const task of this.tasks) {
          await task;
        }
        this.tasks = [];
        resolve();
      } catch (e) {
        reject(e);
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
      this.tasks.push(run());
      return this;
    }

    replaceCode(code: string | RegExp, replaceWith: string) {
      const run = async () => {
        let content = (await readFile(this.location)).toString();
        content = content.replace(code, replaceWith);
        await writeFile(this.location, content);
      };
      this.tasks.push(run());
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
        const promise = execa(
          `npx ember-cli@latest new ${appName} -b @embroider/app-blueprint --pnpm`,
          {
            cwd: tmpDir,
            stdio: 'inherit',
          },
        );
        const child = promise.child;
        child.stdout.on('data', function (data) {
          console.log('stdout: ' + data);
        });
        child.stderr.on('data', function (data) {
          console.log('stderr: ' + data);
        });
        child.on('close', function (code) {
          console.log('closing code: ' + code);
        });
        await promise;

        await editFile('./vite.config.mjs').replaceCode(
          /\n/,
          "\nimport { hmr } from 'ember-vite-hmr';\n",
        );
        await editFile('./vite.config.mjs').replaceCode(
          'contentFor(),',
          'contentFor(),\n    hmr(),\n',
        );
      }

      await execa('pnpm build', {
        stdio: 'inherit',
      });

      await execa(`pnpm i ../../`, {
        cwd: appDir,
        stdio: 'inherit',
      });

      await execa(`pnpm i --save-dev decorator-transforms @babel/plugin-transform-runtime babel-plugin-ember-template-compilation`, {
        cwd: appDir,
        stdio: 'inherit',
      });

      await editFile('./app/templates/application.hbs').setContent(
        '<WelcomePage /><TestComponent />',
      );

      await editFile('./app/components/test-component.gjs').setContent(`
    import Component from "@glimmer/component";

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

  test('should hmr', async () => {
    await editFile('./app/components/test-component.gjs').setContent(`
    import Component from "@glimmer/component";

    export default class MyComponent extends Component {
      <template>
        Test Component HMR
      </template>
    }
    `);
    await waitForMessage('hmr update /app/templates/application.hbs');
    const body = await page.waitForSelector('.ember-application');
    const bodyContent = await body.evaluate((el) => el.textContent);
    expect(bodyContent, bodyContent).toContain('Test Component HMR');
  });

  test('should hmr with state', async () => {
    await editFile('./app/components/foo-component.gjs').setContent(`
    import Component from "@glimmer/component";

    export default class MyComponent extends Component {
      count = 1;
      <template>
        count: {{this.count}}
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
    await waitForMessage('hmr update /app/templates/application.hbs');
    let body = await page.waitForSelector('.ember-application');
    let bodyContent = await body.evaluate((el) => el.textContent);
    expect(bodyContent, bodyContent).toContain('count 1');

    await editFile('./app/components/foo-component.gjs').setContent(`
    import Component from "@glimmer/component";

    export default class MyComponent extends Component {
      count = 2;
      <template>
        count still 1: {{this.count}}
      </template>
    }
    `);

    body = await page.waitForSelector('.ember-application');
    bodyContent = await body.evaluate((el) => el.textContent);
    expect(bodyContent, bodyContent).toContain('count still 1: 1');
  });
});
