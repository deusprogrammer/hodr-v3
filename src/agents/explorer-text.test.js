import assert from 'node:assert/strict';
import test from 'node:test';
import { Explorer } from './explorer.js';

test('heading tree contains only name, ref, and subheadings while preserving nesting', () => {
  const explorer = new Explorer({ apiKey: 'test-only' });
  const snapshot = [
    { role: 'heading', name: 'Page', ref: 'e1', level: 1 },
    {
      role: 'region', ref: 'e2', children: [
        { role: 'heading', name: 'Detail', ref: 'e3', level: 3 },
        { role: 'heading', name: 'Section', ref: 'e4', level: 2 },
        { role: 'heading', name: 'Peer', ref: 'e5', level: 2 },
      ],
    },
    { role: 'heading', name: 'Next page', ref: 'e6', level: 1 },
  ];
  const [tree, nodes] = explorer.getHeadingTree(snapshot);

  assert.deepEqual(tree, {
    name: 'root', ref: 'root', subheadings: [
      {
        name: 'Page', ref: 'e1', subheadings: [
          { name: 'Detail', ref: 'e3', subheadings: [] },
          { name: 'Section', ref: 'e4', subheadings: [] },
          { name: 'Peer', ref: 'e5', subheadings: [] },
        ],
      },
      { name: 'Next page', ref: 'e6', subheadings: [] },
    ],
  });
  assert.deepEqual(nodes.e3, {
    role: 'heading', name: 'Detail', ref: 'e3', level: 3, parentRef: 'e2', headingRef: 'e3',
  });
});

test('preserves text and unreferenced containers with traversable parent keys', () => {
  const explorer = new Explorer({ apiKey: 'test-only' });
  const snapshot = [
    'Root text',
    {
      role: 'paragraph',
      ref: 'e136',
      children: [
        'Local-only test site.',
        { role: 'generic', children: ['Nested text'] },
        'More text',
      ],
    },
  ];
  const original = structuredClone(snapshot);
  const [, nodes] = explorer.getHeadingTree(snapshot);

  assert.equal(Object.hasOwn(nodes, 'undefined'), false);
  assert.equal(Object.keys(nodes).length, 6);
  assert.deepEqual(nodes['local:0'], {
    role: 'text', text: 'Root text', parentRef: 'root', headingRef: 'root',
  });
  assert.deepEqual(nodes['local:1'], {
    role: 'text', text: 'Local-only test site.', parentRef: 'e136', headingRef: 'root',
  });
  assert.deepEqual(nodes['local:2'], {
    role: 'generic', parentRef: 'e136', headingRef: 'root',
  });
  assert.deepEqual(nodes['local:3'], {
    role: 'text', text: 'Nested text', parentRef: 'local:2', headingRef: 'root',
  });
  assert.deepEqual(nodes['local:4'], {
    role: 'text', text: 'More text', parentRef: 'e136', headingRef: 'root',
  });

  test('selects content by heading association while preserving actual parent links', async () => {
    const explorer = new Explorer({ apiKey: 'test-only' });
    explorer.run = async () => ' e1\n';
    const content = await explorer.explore('Fill out the profile', [
      { role: 'heading', name: 'Profile', ref: 'e1', level: 2 },
      {
        role: 'form', ref: 'e2', children: [
          { role: 'textbox', name: 'Name', ref: 'e3' },
          'Required',
        ],
      },
      { role: 'heading', name: 'Details', ref: 'e4', level: 3 },
      { role: 'textbox', name: 'Biography', ref: 'e5' },
      { role: 'heading', name: 'Shop', ref: 'e6', level: 2 },
      { role: 'button', name: 'Buy', ref: 'e7' },
    ]);

    assert.equal(content.e2.parentRef, 'root');
    assert.equal(content.e2.headingRef, 'e1');
    assert.equal(content.e3.parentRef, 'e2');
    assert.equal(content.e3.headingRef, 'e1');
    assert.equal(content['local:0'].parentRef, 'e2');
    assert.equal(content['local:0'].headingRef, 'e1');
    assert.equal(content.e5.headingRef, 'e4');
    assert.equal(Object.hasOwn(content, 'e6'), false);
    assert.equal(Object.hasOwn(content, 'e7'), false);
  });
  assert.deepEqual(snapshot, original);
  assert.deepEqual(explorer.getHeadingTree(snapshot)[1], nodes);
});
