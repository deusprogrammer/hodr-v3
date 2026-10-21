import { chromium } from 'playwright';

const url = process.argv[2] ?? 'https://example.com';

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const tree = await page.ariaSnapshot();
  process.stdout.write(tree + '\n');
} finally {
  await browser.close();
}
