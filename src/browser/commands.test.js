import assert from 'node:assert/strict';
import test from 'node:test';
import { BrowserClient } from './browser-client.js';
import { Translator } from '../agents/translator.js';
import { commandSchema, commandsSchema, instructionsSchema } from './commands.js';

const commands = [
  { operation: 'type', name: 'Full name', role: 'textbox', value: 'Alex Morgan' },
  { operation: 'check', name: 'Accept terms', role: 'checkbox', value: true },
  { operation: 'check', name: 'Accept terms', role: 'checkbox', value: false },
  { operation: 'click', name: 'Save', role: 'button' },
];
const elements = [
  { ref: 'e1', name: 'Full name', role: 'textbox' },
  { ref: 'e2', name: 'Accept terms', role: 'checkbox' },
  { ref: 'e3', name: 'Save', role: 'button' },
];
const instructions = [
  { operation: 'type', ref: 'e1', value: 'Alex Morgan' },
  { operation: 'check', ref: 'e2', value: true },
  { operation: 'check', ref: 'e2', value: false },
  { operation: 'click', ref: 'e3' },
];

function fakeClient(failOperation) {
  const calls = [];
  const tree = [{ role: 'status', name: 'Saved' }];
  const client = new BrowserClient({
    tree: [],
    page: {
      getByRole(role, options) {
        calls.push(['target', role, options]);
        const invoke = async (operation, ...args) => {
          calls.push([operation, ...args]);
          if (operation === failOperation) throw new Error('Interaction failed');
        };
        return {
          click: () => invoke('click'),
          fill: (value) => invoke('fill', value),
          setChecked: (value) => invoke('setChecked', value),
          selectOption: (value) => invoke('selectOption', value),
          press: (value) => invoke('press', value),
          focus: () => invoke('focus'),
          hover: () => invoke('hover'),
        };
      },
      getByLabel(name, options) {
        calls.push(['label', name, options]);
        return {
          setInputFiles: async (paths) => { calls.push(['setInputFiles', paths]); },
        };
      },
    },
    settle: async () => { calls.push(['settle']); },
    snapshot: async () => { calls.push(['snapshot']); return tree; },
  });
  return { client, calls, tree };
}

test('runs commands sequentially with exact accessible targets and refreshes the snapshot', async () => {
  const { client, calls, tree } = fakeClient();
  assert.strictEqual(await client.runCommands(commands), tree);
  assert.strictEqual(client.tree, tree);
  assert.deepEqual(calls, [
    ['target', 'textbox', { name: 'Full name', exact: true }],
    ['fill', 'Alex Morgan'], ['settle'],
    ['target', 'checkbox', { name: 'Accept terms', exact: true }],
    ['setChecked', true], ['settle'],
    ['target', 'checkbox', { name: 'Accept terms', exact: true }],
    ['setChecked', false], ['settle'],
    ['target', 'button', { name: 'Save', exact: true }],
    ['click'], ['settle'], ['snapshot'],
  ]);
});

test('validates the whole batch before performing any actions', async () => {
  for (const invalid of [
    { operation: 'delete', role: 'button', name: 'Save' },
    { operation: 'type', role: 'textbox', name: 'Full name', value: 42 },
    { operation: 'type', role: 'button', name: 'Save', value: 'Text' },
    { operation: 'check', role: 'checkbox', name: 'Accept terms', value: 'false' },
    { operation: 'check', role: 'radio', name: 'Daily', value: false },
    { operation: 'click', role: 'button', name: 'Save', value: 'unexpected' },
  ]) {
    const { client, calls } = fakeClient();
    await assert.rejects(client.runCommands([commands[0], invalid]));
    assert.deepEqual(calls, []);
  }
});

test('stops at the first interaction error and preserves its cause', async () => {
  const { client, calls } = fakeClient('fill');
  await assert.rejects(client.runCommands(commands), (error) => {
    assert.match(error.message, /command 1 failed/);
    assert.equal(error.cause.message, 'Interaction failed');
    return true;
  });
  assert.equal(calls.length, 2);
});

test('empty command lists return a current snapshot', async () => {
  const { client, calls, tree } = fakeClient();
  assert.strictEqual(await client.runCommands([]), tree);
  assert.deepEqual(calls, [['snapshot']]);
});

test('executes select, keyboard, focus, hover, clear, and authorized uploads', async () => {
  const { client, calls } = fakeClient();
  const additional = [
    { operation: 'select', name: 'Language', role: 'combobox', by: 'label', value: 'French' },
    { operation: 'select', name: 'Topics', role: 'listbox', by: 'value', value: ['tech', 'art'] },
    { operation: 'press', name: 'Search', role: 'searchbox', value: 'Enter' },
    { operation: 'focus', name: 'Name', role: 'textbox' },
    { operation: 'hover', name: 'Menu', role: 'button' },
    { operation: 'clear', name: 'Name', role: 'textbox' },
    { operation: 'upload', name: 'Attachment', role: 'button', value: ['/tmp/report.txt'] },
  ];
  assert.deepEqual(commandsSchema.parse(additional), additional);
  await client.runCommands(additional, { allowedUploadPaths: ['/tmp/report.txt'] });
  assert.deepEqual(calls.filter(([type]) =>
    !['target', 'label', 'settle', 'snapshot'].includes(type)), [
    ['selectOption', [{ label: 'French' }]],
    ['selectOption', [{ value: 'tech' }, { value: 'art' }]],
    ['press', 'Enter'], ['focus'], ['hover'], ['fill', ''],
    ['setInputFiles', ['/tmp/report.txt']],
  ]);
  assert.deepEqual(calls.at(-4), ['label', 'Attachment', { exact: true }]);
});

test('rejects malformed additional commands', () => {
  for (const command of [
    { operation: 'select', name: 'Language', role: 'combobox', by: 'index', value: '1' },
    { operation: 'select', name: 'Language', role: 'combobox', by: 'label', value: [] },
    { operation: 'select', name: 'Language', role: 'textbox', by: 'label', value: 'French' },
    { operation: 'press', name: 'Name', role: 'textbox', value: ' ' },
    { operation: 'focus', name: 'Name', role: 'textbox', value: 'extra' },
    { operation: 'hover', name: 'Menu', role: 'button', value: 'extra' },
    { operation: 'clear', name: 'Menu', role: 'button' },
    { operation: 'upload', name: 'Attachment', role: 'button', value: ['relative.txt'] },
    { operation: 'upload', name: 'Attachment', role: 'button', value: [] },
  ]) {
    assert.equal(commandSchema.safeParse(command).success, false, JSON.stringify(command));
  }
});

test('rejects unauthorized upload paths before any command executes', async () => {
  const { client, calls } = fakeClient();
  const batch = [
    commands[0],
    { operation: 'upload', name: 'Attachment', role: 'button', value: ['/tmp/private.txt'] },
  ];
  await assert.rejects(client.runCommands(batch), /not explicitly allowed/);
  assert.deepEqual(calls, []);
});

test('translator returns validated commands for supplied elements', async () => {
  const translator = new Translator({ apiKey: 'test-only' });
  translator.run = async () => JSON.stringify(instructions);
  assert.deepEqual(await translator.translate('Fill and save', elements), commands);
  const map = Object.fromEntries(elements.map((element) => [element.ref, element]));
  assert.deepEqual(await translator.translate('Fill and save', map), commands);
});

test('instruction schema supports every operation without model-generated names or roles', () => {
  const batch = [
    ...instructions,
    { operation: 'select', ref: 'e4', by: 'label', value: ['French'] },
    { operation: 'press', ref: 'e1', value: 'Enter' },
    { operation: 'focus', ref: 'e1' },
    { operation: 'hover', ref: 'e3' },
    { operation: 'clear', ref: 'e1' },
    { operation: 'upload', ref: 'e5', value: ['/tmp/report.txt'] },
  ];
  assert.deepEqual(instructionsSchema.parse(batch), batch);
  assert.equal(instructionsSchema.safeParse([
    { operation: 'click', ref: 'e3', name: 'Invented', role: 'button' },
  ]).success, false);
});

test('translator validates operation roles after resolving refs', async () => {
  const translator = new Translator({ apiKey: 'test-only' });
  translator.run = async () => JSON.stringify([{ operation: 'type', ref: 'e3', value: 'Wrong target' }]);
  await assert.rejects(translator.translate('Instructions', elements));
  translator.run = async () => JSON.stringify([{ operation: 'check', ref: 'e4', value: false }]);
  await assert.rejects(translator.translate('Instructions', [
    { ref: 'e4', name: 'Daily', role: 'radio' },
  ]));
});

test('translator rejects mismatched map refs and ambiguous execution targets', async () => {
  const translator = new Translator({ apiKey: 'test-only' });
  translator.run = async () => JSON.stringify([instructions[0]]);
  await assert.rejects(translator.translate('Instructions', { wrong: elements[0] }), /map key/);
  await assert.rejects(translator.translate('Instructions', [
    elements[0], { ...elements[0], ref: 'e99' },
  ]), /Expected one supplied element/);
});

test('translator resolves names and roles from map keys even without redundant ref properties', async () => {
  const translator = new Translator({ apiKey: 'test-only' });
  translator.run = async () => JSON.stringify([instructions[0]]);
  assert.deepEqual(await translator.translate('Instructions', {
    e1: { name: 'Full name', role: 'textbox' },
  }), [commands[0]]);
});

test('translator rejects invalid JSON, unsupported actions, unknown and ambiguous targets', async () => {
  const translator = new Translator({ apiKey: 'test-only' });
  for (const response of [
    '```json\n[]\n```',
    '{"error":"Dropdown selection is unsupported"}',
    JSON.stringify([{ operation: 'click', ref: 'missing' }]),
    JSON.stringify([{ operation: 'type', ref: 'e1' }]),
    JSON.stringify([{ operation: 'click', ref: 'local:0' }]),
  ]) {
    translator.run = async () => response;
    await assert.rejects(translator.translate('Instructions', elements));
  }
  translator.run = async () => JSON.stringify([instructions[0]]);
  await assert.rejects(translator.translate('Instructions', [...elements, elements[0]]));
});
