import { chromium } from 'playwright';
import { commandsSchema } from './commands.js';
import { resolve } from 'node:path';

const DATA_RESOURCE_TYPES = new Set(['xhr', 'fetch']);

/**
 * Loads a URL and returns its accessibility tree as a JSON hierarchy along with
 * the Playwright handles needed to probe and manipulate the page.
 *
 * Every node in `tree` carries a `ref` (e.g. "e13") that can be turned into a
 * Locator with `locate(ref)`. Refs are only valid for the latest snapshot; call
 * `snapshot()` after interacting with the page to get a fresh tree.
 */
export async function loadPage(url, {
  headless = true,
  timeout = 30_000,
  settleTimeout = 10_000,
  quietMs = 500,
  browser: existingBrowser,
} = {}) {
  const browser = existingBrowser ?? await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(timeout);

  const tracker = trackDataRequests(page);
  try {
    await page.goto(url, { waitUntil: 'load', timeout });
    await waitForSettled(page, tracker, { settleTimeout, quietMs });
  } catch (err) {
    await closeAll();
    throw err;
  }

  const snapshot = async () => {
    // Catch late hydration triggered by anything since the last settle.
    await waitForSettled(page, tracker, { settleTimeout, quietMs });
    return page.ariaSnapshotJSON({ mode: 'ai' });
  };

  async function closeAll() {
    tracker.dispose();
    await context.close().catch(() => {});
    if (!existingBrowser) await browser.close().catch(() => {});
  }

  return {
    tree: await snapshot(),
    browser,
    context,
    page,
    locate: (ref) => page.locator(`aria-ref=${ref}`),
    snapshot,
    settle: () => waitForSettled(page, tracker, { settleTimeout, quietMs }),
    close: closeAll,
  };
}

/**
 * Stateful wrapper around `loadPage` that holds the browser, context, page and
 * the most recent accessibility tree. Create with `await BrowserClient.open(url)`.
 */
export class BrowserClient {
  #session;

  constructor(session) {
    this.#session = session;
    this.tree = session.tree;
  }

  static async open(url, options) {
    return new BrowserClient(await loadPage(url, options));
  }

  get browser() { return this.#session.browser; }
  get context() { return this.#session.context; }
  get page() { return this.#session.page; }
  get url() { return this.page.url(); }

  /** Navigates the existing page, waits for it to settle and refreshes `tree`. */
  async goto(url) {
    await this.page.goto(url, { waitUntil: 'load' });
    return this.snapshot();
  }

  /** Waits for the page to settle and refreshes `tree`. */
  async snapshot() {
    this.tree = await this.#session.snapshot();
    return this.tree;
  }

  settle() {
    return this.#session.settle();
  }

  /** Returns a Locator for a node `ref` from the current `tree`. */
  locate(ref) {
    return this.#session.locate(ref);
  }

  /**
   * Executes validated translator commands in order, stopping on the first error.
   * Uses exact accessible names/roles, not snapshot refs. Returns a fresh snapshot.
   * Uploads use an exact label and require explicitly allowed absolute file paths.
   */
  async runCommands(commands, { allowedUploadPaths = [] } = {}) {
    const validated = commandsSchema.parse(commands);
    const allowedPaths = new Set(allowedUploadPaths.map((path) => resolve(path)));
    for (const command of validated) {
      if (command.operation === 'upload') {
        for (const path of command.value) {
          if (!allowedPaths.has(resolve(path))) {
            throw new Error(`Upload path is not explicitly allowed: ${path}`);
          }
        }
      }
    }
    for (const [index, command] of validated.entries()) {
      try {
        const target = command.operation === 'upload'
          ? this.page.getByLabel(command.name, { exact: true })
          : this.page.getByRole(command.role, { name: command.name, exact: true });
        switch (command.operation) {
          case 'click':
            await target.click();
            break;
          case 'type':
            await target.fill(command.value);
            break;
          case 'check':
            await target.setChecked(command.value);
            break;
          case 'select':
            await target.selectOption(
              (Array.isArray(command.value) ? command.value : [command.value])
                .map((value) => ({ [command.by]: value })),
            );
            break;
          case 'press':
            await target.press(command.value);
            break;
          case 'focus':
            await target.focus();
            break;
          case 'hover':
            await target.hover();
            break;
          case 'clear':
            await target.fill('');
            break;
          case 'upload':
            await target.setInputFiles(command.value);
            break;
        }
        await this.settle();
      } catch (cause) {
        throw new Error(
          `Browser command ${index + 1} failed: ${command.operation} "${command.name}" (${command.role}).`,
          { cause },
        );
      }
    }
    return this.snapshot();
  }

  close() {
    return this.#session.close();
  }
}

function trackDataRequests(page) {
  const inFlight = new Set();
  let lastActivity = Date.now();

  const onStart = (req) => {
    if (!DATA_RESOURCE_TYPES.has(req.resourceType())) return;
    inFlight.add(req);
    lastActivity = Date.now();
  };
  const onEnd = (req) => {
    if (inFlight.delete(req)) lastActivity = Date.now();
  };

  page.on('request', onStart);
  page.on('requestfinished', onEnd);
  page.on('requestfailed', onEnd);

  return {
    get pending() { return inFlight.size; },
    get idleFor() { return inFlight.size ? 0 : Date.now() - lastActivity; },
    dispose() {
      page.off('request', onStart);
      page.off('requestfinished', onEnd);
      page.off('requestfailed', onEnd);
    },
  };
}

/**
 * Best effort: waits until there are no in-flight XHR/fetch requests and the DOM
 * has stopped mutating, each for `quietMs`. Gives up silently after `settleTimeout`
 * so pages with polling or streaming connections still return.
 */
async function waitForSettled(page, tracker, { settleTimeout, quietMs }) {
  const deadline = Date.now() + settleTimeout;
  const remaining = () => Math.max(0, deadline - Date.now());

  while (remaining() > 0 && tracker.idleFor < quietMs) {
    await page.waitForTimeout(Math.min(100, remaining()));
  }

  if (remaining() > 0) {
    await page.evaluate(waitForDomQuiet, { quietMs, maxMs: remaining() }).catch(() => {});
  }

  // DOM changes may have kicked off another round of requests.
  while (remaining() > 0 && tracker.idleFor < quietMs) {
    await page.waitForTimeout(Math.min(100, remaining()));
  }
}

function waitForDomQuiet({ quietMs, maxMs }) {
  return new Promise((resolve) => {
    let timer;
    const done = () => {
      observer.disconnect();
      clearTimeout(timer);
      clearTimeout(cap);
      resolve();
    };
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(done, quietMs);
    });
    observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    timer = setTimeout(done, quietMs);
    const cap = setTimeout(done, maxMs);
  });
}
