import child from 'child_process';
import { resolve } from 'path';
import PCR from 'puppeteer-chromium-resolver';

export async function startVite({ cwd }: { cwd: string }) {
  const { puppeteer, executablePath } = await PCR({});

  globalThis.console.log('[ci] starting');
  const messages: string[] = [];
  let runvite: ReturnType<typeof child.fork>;

  await new Promise<void>((fulfill, reject) => {
    globalThis.console.log('start vite');
    runvite = child.fork(
      resolve('.', 'node_modules', 'vite', 'bin', 'vite.js'),
      ['--port', '60173', '--no-open', '--force'],
      {
        stdio: 'pipe',
        cwd,
      },
    );

    let err = '';

    runvite.on('exit', () => {
      reject(new Error('closed:' + err));
    });

    globalThis.process.on('exit', () => runvite.kill());

    runvite.stderr?.on('data', (data) => {
      err += String(data);
      globalThis.console.log('stderr', String(data));
    });

    runvite.stdout?.on('data', (data) => {
      // remove color codes
      globalThis.console.log('stdout', String(data));
      // eslint-disable-next-line no-control-regex
      const chunk = String(data).replace(/\u001b[^m]*?m/g, '');
      messages.push(...chunk.split('\n'));
      globalThis.console.log('stdout', chunk);
      if (chunk.includes('Local') && chunk.includes('60173')) {
        fulfill(1);
      }
    });

    globalThis.console.log('[ci] spawning');
  });

  globalThis.console.log('[ci] spawned');

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  globalThis.console.log('[ci] puppeteer launched');

  try {
    const page = await browser.newPage();
    globalThis.console.log('load page');
    await page.goto('http://localhost:60173');
    page.on('console', (msg) => {
      globalThis.console.log(msg.text());
      messages.push(msg.text());
    });

    function onMessage(onCb: () => void) {
      function later() {
        globalThis.setTimeout(onCb, 100);
      }
      page.on('console', later);
      runvite.stdout?.on('data', later);
    }

    return {
      page,
      onMessage,
      messages,
      baseUri: 'http://localhost:60173',
    };
  } catch {
    await browser.close();
    globalThis.process.exit(1);
  }

  await browser.close();
}
