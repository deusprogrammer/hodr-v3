import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent } from './agent.js';
import { Reporter } from './reporter.js';
import { MessageQueue } from './message-queue.js';

test('queue delivers FIFO, isolates subscriber data, and supports unsubscribe', () => {
  const queue = new MessageQueue();
  const received = [];
  queue.subscribe((event) => {
    if (event.type === 'first') queue.publish({ type: 'second' });
    event.type = 'mutated';
  });
  const unsubscribe = queue.subscribe((event) => received.push(event));
  queue.publish({ type: 'first' });
  unsubscribe();
  queue.publish({ type: 'third' });
  assert.deepEqual(received.map((event) => event.type), ['first', 'second']);
  assert.deepEqual(received.map((event) => event.sequence), [1, 2]);
  assert.ok(received.every((event) => !Number.isNaN(Date.parse(event.timestamp))));
});

test('agents publish correlated inputs, outputs, continuations, and original errors', async () => {
  const queue = new MessageQueue();
  const events = [];
  queue.subscribe((event) => events.push(event));
  const agent = new Agent({ apiKey: 'test-only', systemPrompt: 'Instructions', messageQueue: queue });
  agent.client.responses.create = async () => ({ output_text: 'Response', usage: { total_tokens: 10 } });
  assert.equal(await agent.run('Task'), 'Response');
  await agent.continue('More');
  const failure = new Error('Unavailable');
  agent.client.responses.create = async () => { throw failure; };
  await assert.rejects(agent.run('Retry'), (error) => error === failure);
  assert.deepEqual(events.map((event) => event.type), [
    'agent.input', 'agent.output', 'agent.input', 'agent.output', 'agent.input', 'agent.error',
  ]);
  assert.equal(events[0].requestId, events[1].requestId);
  assert.notEqual(events[0].requestId, events[2].requestId);
  assert.deepEqual(events[0].input, [
    { role: 'system', content: 'Instructions' }, { role: 'user', content: 'Task' },
  ]);
  assert.equal(events[2].input.length, 3);
  assert.equal(events[4].input.length, 2);
  assert.equal(events[1].output, 'Response');
  assert.equal(events[5].error.message, 'Unavailable');
});

test('Reporter saves the detailed transcript without a model client or summary', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-reporter-'));
  const queue = new MessageQueue();
  const reporter = new Reporter({ messageQueue: queue });
  try {
    assert.equal('client' in reporter, false);
    assert.equal('run' in reporter, false);
    const agent = new Agent({ apiKey: 'test-only', messageQueue: queue });
    agent.client.responses.create = async () => ({ output_text: 'Click Save' });
    await agent.run('Save the profile');
    const copy = reporter.transcript;
    copy[0].input[1].content = 'mutated';
    assert.equal(reporter.transcript[0].input[1].content, 'Save the profile');
    const result = await reporter.finish({ directory, task: 'Save profile' });
    const report = await readFile(result.path, 'utf8');
    assert.equal(Object.hasOwn(result, 'summary'), false);
    assert.doesNotMatch(report, /## Summary|Summary generation/);
    assert.match(report, /Save the profile/);
    assert.match(report, /Click Save/);
    assert.match(report, /requestId/);
    assert.equal(reporter.transcript.length, 2);
    queue.publish({ type: 'after.finish' });
    assert.equal(reporter.transcript.length, 2);
    await assert.rejects(reporter.finish({ directory }), /only be called once/);
  } finally {
    reporter.close();
    await rm(directory, { recursive: true });
  }
});

test('Reporter preserves workflow errors in the transcript', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-reporter-'));
  const queue = new MessageQueue();
  const reporter = new Reporter({ messageQueue: queue });
  try {
    queue.publish({ type: 'workflow.error', error: { message: 'Browser failed' } });
    const { path } = await reporter.finish({ directory });
    const report = await readFile(path, 'utf8');
    assert.match(report, /Browser failed/);
  } finally {
    reporter.close();
    await rm(directory, { recursive: true });
  }
});

test('Reporter saves an empty transcript', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-reporter-'));
  const reporter = new Reporter({ messageQueue: new MessageQueue() });
  try {
    const { path } = await reporter.finish({ directory });
    assert.match(await readFile(path, 'utf8'), /No events recorded/);
  } finally {
    reporter.close();
    await rm(directory, { recursive: true });
  }
});
