import { test } from 'node:test';
import assert from 'node:assert';
import { getMetadata, prepareScriptContent, wrapScriptContent } from './utils.js';

test('getMetadata - parses valid metadata at the end', () => {
    const content = `
module.exports = function (msg) {
    return msg;
};

/* flows.json attributes
    "id": "node-123",
    "name": "My Node"
*/
`;
    const meta = getMetadata(content);
    assert.deepStrictEqual(meta, { id: 'node-123', name: 'My Node', z: 'global' });
});

test('getMetadata - parses valid metadata at the start', () => {
    const content = `
/* flows.json attributes
    "id": "node-456",
    "name": "Other Node"
*/

module.exports = function (msg) {
    return msg;
};
`;
    const meta = getMetadata(content);
    assert.deepStrictEqual(meta, { id: 'node-456', name: 'Other Node', z: 'global' });
});

test('getMetadata - parses JSDoc format', () => {
    const content = `
/**
 * @nr-id a1b2
 * @nr-name Super Node
 * @nr-z tab1
 */
`;
    const meta = getMetadata(content);
    assert.deepStrictEqual(meta, { id: 'a1b2', name: 'Super Node', z: 'tab1' });
});

test('getMetadata - handles malformed JSON gracefully', () => {
    const content = `
/* flows.json attributes
    "id": "node-123"
    "name": "Missing Comma"
*/
`;
    const meta = getMetadata(content);
    assert.strictEqual(meta, null);
});

test('prepareScriptContent - strips basic module.exports wrapper', () => {
    const raw = `
module.exports = function (msg, flow, env, node, global, context) {
    msg.payload = "hello";
    return msg;
};

/* flows.json attributes
    "id": "123"
*/
`;
    const prepared = prepareScriptContent(raw);
    assert.strictEqual(prepared, 'msg.payload = "hello";\n    return msg;');
});

test('prepareScriptContent - handles async functions', () => {
    const raw = `
module.exports = async function (msg) {
    await someAsyncCall();
    return msg;
};
`;
    const prepared = prepareScriptContent(raw);
    assert.strictEqual(prepared, 'await someAsyncCall();\n    return msg;');
});

test('wrapScriptContent - generates correctly formatted file', () => {
    const nodeId = 'node-abc';
    const nodeName = 'Node ABC';
    const funcBody = 'msg.payload = true;\nreturn msg;';
    const z = 'tab-123';

    const wrapped = wrapScriptContent(nodeId, nodeName, funcBody, z);

    assert.ok(wrapped.includes('module.exports = function (msg, flow, env, node, global, context) {'));
    assert.ok(wrapped.includes('    msg.payload = true;'));
    assert.ok(wrapped.includes('* @nr-id node-abc'));
    assert.ok(wrapped.includes('* @nr-name Node ABC'));
    assert.ok(wrapped.includes('* @nr-z tab-123'));
});

test('wrapScriptContent - handles multiline indentation correctly', () => {
    const funcBody = 'if (true) {\n    console.log("test");\n}';
    const wrapped = wrapScriptContent('id', 'name', funcBody, 'z');

    // Check indentation of the second line in the body
    assert.ok(wrapped.includes('        console.log("test");'));
});
