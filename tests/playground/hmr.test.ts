import util from 'node:util';
import { expect, test, describe, beforeAll } from 'vitest'
import { ensureDir, readFile, pathExistsSync, writeFile } from 'fs-extra';
import { join, dirname, resolve } from 'path';
import * as process from 'node:process';
import { startVite } from '../utils/index';

const execa = util.promisify(require('child_process').exec);


describe('hmr tests', () => {

  let endpoint = '';
  let page;
  const tmpDir = resolve('./tmp');
  const appName = 'my-fancy-app'
  let appDir = resolve(tmpDir, appName);
  let viteContext: any;

  async function waitForMessage(withText: string|RegExp) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        console.log('waitForMessage time out, messages', viteContext.messages.map(m => m.text()));
      }, 3000);
      function check() {
        const m = viteContext.messages.find(m => withText instanceof RegExp ? withText.test(m.text()) : m.text().includes(withText));
        if (m) {
          clearTimeout(t);
          resolve(m);
        }
      }
      check();
      viteContext.page.on('message', check);
    })
  }

  interface EditFile {
    // @ts-ignore
    then?: PromiseLike<any>["then"];
  }

  class EditFile {
    location: string;
    tasks = [];

    // @ts-ignore
    async then(resolve, reject) {
      try {
        for (const task of this.tasks) {
          await task
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
      }
      this.tasks.push(run());
      return this;
    }

    replaceCode(code: string|RegExp, replaceWith: string) {
      const run = async () => {
        let content = (await readFile(this.location)).toString();
        content = content.replace(code, replaceWith);
        await writeFile(this.location, content);
      }
      this.tasks.push(run());
      return this;
    }
  }

  function editFile(path: string) {
    const location = resolve(appDir, path);
    return new EditFile(location)
  }

  beforeAll(async () => {
    if (!pathExistsSync(tmpDir) || !process.env.REUSE) {
      await ensureDir(tmpDir);
      console.log('install to', tmpDir)
      const promise = execa(`npx ember-cli@latest new ${appName} -b @embroider/app-blueprint --pnpm`, {
        cwd: tmpDir,
        stdio: "inherit"
      });
      const child = promise.child;
      child.stdout.on('data', function(data) {
        console.log('stdout: ' + data);
      });
      child.stderr.on('data', function(data) {
        console.log('stderr: ' + data);
      });
      child.on('close', function(code) {
        console.log('closing code: ' + code);
      });
      await promise;
    }

    await execa('pnpm build', {
      stdio: "inherit"
    })

    await execa(`pnpm i ../../`, {
      cwd: appDir,
      stdio: "inherit"
    });

    await editFile('./vite.config.mjs').replaceCode(/$/, 'import { hmr } from \'ember-vite-hmr\';\n')
    await editFile('./vite.config.mjs').replaceCode(/plugins: \[/, 'plugins: [hmr(),\n')

    await editFile('./app/components/test-component.gjs').setContent(`
    import Component from "@glimmer/component";

    export default class MyComponent extends Component {
      <template>
        Test Component
      </template>
    }
    `)

    viteContext = await startVite({
      cwd: appDir
    });
    endpoint = viteContext.baseUri;
    page = viteContext.page;
  }, 2 * 60 * 1000);

  test('should render', async () => {
    const body = await page.waitForSelector('#ember-welcome-page-id-selector');
    const bodyContent = await body.evaluate(el => el.textContent);
    expect(bodyContent, bodyContent).toContain('Congratulations, you made it!')
  })

  test('should update routes', async () => {
    await editFile('./app/templates/application.hbs').setContent('<TestComponent />');
    await waitForMessage('page reload app/templates/application.hbs');
    const body = await page.waitForSelector('.ember-application');
    const bodyContent = await body.evaluate(el => el.textContent);
    expect(bodyContent, bodyContent).toContain('Test Component');
  })

  test('should hmr', async () => {
    await editFile('./app/components/test-component.gjs').setContent(`
    import Component from "@glimmer/component";

    export default class MyComponent extends Component {
      <template>
        Test Component HMR
      </template>
    }
    `)
    await waitForMessage('page reload app/components/test-component.gjs');
    const body = await page.waitForSelector('.ember-application');
    const bodyContent = await body.evaluate(el => el.textContent);
    expect(bodyContent, bodyContent).toContain('Test Component HMR');
  })
})

