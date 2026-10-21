import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { agentMessageQueue } from './message-queue.js';

function jsonBlock(value) {
  const json = JSON.stringify(value, null, 2);
  const runs = json.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(3, ...runs.map((run) => run.length + 1)));
  return `${fence}json\n${json}\n${fence}`;
}

export class Reporter {
  #events = [];
  #unsubscribe;
  #finishing = false;

  constructor({ messageQueue = agentMessageQueue } = {}) {
    this.#unsubscribe = messageQueue.subscribe((event) => {
      this.#events.push(event);
    });
  }

  get transcript() {
    return structuredClone(this.#events);
  }

  close() {
    this.#unsubscribe();
  }

  /**
   * Stops listening and persists the detailed transcript without model calls.
   */
  async finish({ directory = 'reports', task = '' } = {}) {
    if (this.#finishing) throw new Error('Reporter.finish() may only be called once.');
    this.#finishing = true;
    this.close();
    const events = this.transcript;
    await mkdir(directory, { recursive: true });
    const path = join(directory,
      `run-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.md`);
    const transcript = events.map((event) =>
      `### Event ${event.sequence}: ${event.type}\n\n${jsonBlock(event)}`).join('\n\n');
    const report =
      `# Agent run report\n\n## Task\n\n${jsonBlock(task)}\n\n## Detailed transcript\n\n${transcript || 'No events recorded.'}\n`;
    await writeFile(path, report, 'utf8');
    return { path };
  }
}
