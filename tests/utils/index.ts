import child from 'child_process';
import { resolve } from 'path';
import PCR from 'puppeteer-chromium-resolver';
import { fileURLToPath } from 'url';

export async function startVite({ cwd }) {
// eslint-disable-next-line new-cap
  const { puppeteer, executablePath } = await PCR({});

  console.log('[ci] starting');

  await /** @type {Promise<void>} */ (
    new Promise((fulfill) => {
        console.log('start vite')
      const runvite = child.fork(
        resolve('.', 'node_modules', 'vite', 'bin', 'vite.js'),
        ['--port', '60173', '--no-open', '--force'],
        {
          stdio: 'pipe',
          cwd
        }
      );

      process.on('exit', () => runvite.kill());

      runvite.stderr?.on('data', (data) => {
        console.log('stderr', String(data));
      });

      runvite.stdout?.on('data', (data) => {
        const chunk = String(data);
        console.log('stdout', chunk);
        if (chunk.includes('Local') && chunk.includes('60173')) {
          fulfill(1);
        }
      });

      console.log('[ci] spawning');
    })
  );

  console.log('[ci] spawned');

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  console.log('[ci] puppeteer launched');

  try {
      const messages = [];
      const page = await browser.newPage();
      await page.goto('http://localhost:60173');
      page.on('console', (msg) => {
          messages.push(msg);
      })
      return {
          page,
          messages,
          baseUri: 'http://localhost:60173'
      }
  } catch {
    await browser.close();
    process.exit(1);
  }

  await browser.close();
}