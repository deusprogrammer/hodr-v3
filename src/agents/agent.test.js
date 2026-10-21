import assert from 'node:assert/strict';
import test from 'node:test';
import { Agent } from './agent.js';
import { Explorer } from './explorer.js';

function stubResponses(agent) {
  const calls = [];
  agent.client.responses.create = async (request) => {
    calls.push(structuredClone(request));
    return { output_text: `Result ${calls.length}` };
  };
  return calls;
}

test('run replaces history and continue appends, with one system prompt per request', async () => {
  const agent = new Agent({ apiKey: 'test-only', systemPrompt: 'System instructions' });
  const calls = stubResponses(agent);
  const system = { role: 'system', content: 'System instructions' };
  const first = { role: 'user', content: 'First task' };
  const second = { role: 'user', content: 'More data' };
  const third = { role: 'user', content: 'New task' };

  assert.equal(await agent.run(first.content), 'Result 1');
  assert.deepEqual(agent.messages, [first]);
  assert.equal(await agent.continue(second.content), 'Result 2');
  assert.deepEqual(agent.messages, [first, second]);
  assert.equal(await agent.run(third.content), 'Result 3');
  assert.deepEqual(agent.messages, [third]);
  assert.deepEqual(calls, [
    { model: agent.model, input: [system, first] },
    { model: agent.model, input: [system, first, second] },
    { model: agent.model, input: [system, third] },
  ]);
});

test('continue can start a conversation and preserves the default prompt behavior', async () => {
  const agent = new Agent({ apiKey: 'test-only' });
  agent.prompt = 'Default input';
  const calls = stubResponses(agent);

  await agent.continue();
  assert.deepEqual(calls[0].input, [
    { role: 'system', content: '' },
    { role: 'user', content: 'Default input' },
  ]);
  await agent.run();
  assert.deepEqual(agent.messages, [{ role: 'user', content: 'Default input' }]);
});

test('Explorer supplies its system prompt to the parent constructor', async () => {
  const agent = new Explorer({ apiKey: 'test-only' });
  const calls = stubResponses(agent);

  assert.match(agent.systemPrompt, /accessibility tree/);
  assert.equal(await agent.run('Choose a heading'), 'Result 1');
  assert.equal(await agent.continue('Additional context'), 'Result 2');
  for (const call of calls) {
    assert.deepEqual(call.input[0], { role: 'system', content: agent.systemPrompt });
    assert.equal(call.input.filter((message) => message.role === 'system').length, 1);
  }
});

test('API errors propagate to the caller', async () => {
  const agent = new Agent({ apiKey: 'test-only' });
  const error = new Error('Request failed');
  agent.client.responses.create = async () => { throw error; };

  await assert.rejects(agent.run('Task'), error);
  await assert.rejects(agent.continue('Retry context'), error);
});
