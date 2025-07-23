import child from 'child_process';
import { resolve } from 'path';
import PCR from 'puppeteer-chromium-resolver';
import { fileURLToPath } from 'url';

export async function startVite({ cwd }) {
  // eslint-disable-next-line new-cap
  const { puppeteer, executablePath } = await PCR({});

  console.log('[ci] starting');
  const messages = [];
  let runvite;

  await /** @type {Promise<void>} */ new Promise((fulfill, reject) => {
    console.log('start vite');
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

    process.on('exit', () => runvite.kill());

    runvite.stderr?.on('data', (data) => {
      err += String(data);
      console.log('stderr', String(data));
    });

    runvite.stdout?.on('data', (data) => {
      // remove color codes
      console.log('stdout', String(data));
      const chunk = String(data).replace(/\u001b[^m]*?m/g, '');
      messages.push(...chunk.split('\n'));
      console.log('stdout', chunk);
      if (chunk.includes('Local') && chunk.includes('60173')) {
        fulfill(1);
      }
    });

    console.log('[ci] spawning');
  });

  console.log('[ci] spawned');

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  console.log('[ci] puppeteer launched');

  try {
    const page = await browser.newPage();
    console.log('load page');
    await page.goto('http://localhost:60173');
    page.on('console', (msg) => {
      console.log(msg.text());
      messages.push(msg.text());
    });

    function onMessage(onCb) {
      function later() {
        setTimeout(onCb, 100);
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
    process.exit(1);
  }

  await browser.close();
}
