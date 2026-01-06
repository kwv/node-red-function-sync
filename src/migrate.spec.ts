import { test, after, before } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const TEST_DIR = path.resolve(process.cwd(), 'test-migrate');
const FLOWS_PATH = path.join(TEST_DIR, 'flows.json');
const SRC_DIR = path.join(TEST_DIR, 'src');

before(() => {
    if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(SRC_DIR, { recursive: true });
});

after(() => {
    if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
});

test('nr-migrate reorganizes files into named folders using flows.json', () => {
    const flows = [
        { id: 'tab_id_123', type: 'tab', label: 'My Awesome Tab' },
        { id: 'node_abc', type: 'function', z: 'tab_id_123', name: 'Cool Node', func: 'return msg;' }
    ];
    fs.writeFileSync(FLOWS_PATH, JSON.stringify(flows), 'utf8');

    // Create file with OLD metadata and NO folder
    const filePath = path.join(SRC_DIR, 'cool-node.js');
    const content = `
module.exports = function (msg) { return msg; };
/* flows.json attributes
    "id": "node_abc",
    "name": "Cool Node",
    "tabId": "tab_id_123"
*/`;
    fs.writeFileSync(filePath, content, 'utf8');

    // Run migrate with --flows
    const migrateScript = path.resolve(process.cwd(), 'dist/migrate.js');
    execSync(`node ${migrateScript} --src ${SRC_DIR} --flows ${FLOWS_PATH}`);

    const expectedPath = path.join(SRC_DIR, 'my-awesome-tab', 'cool-node.js');
    assert.ok(fs.existsSync(expectedPath), `File should have moved to ${expectedPath}`);
    assert.ok(!fs.existsSync(filePath), 'Original file should be gone');

    const migratedContent = fs.readFileSync(expectedPath, 'utf8');
    assert.ok(migratedContent.includes('@nr-id node_abc'), 'Metadata should be JSDoc');
    assert.ok(migratedContent.includes('@nr-z tab_id_123'), 'Metadata should have z property');
});

test('nr-migrate handles missing tabId by looking up flows.json', () => {
    const flows = [
        { id: 'tab_id_456', type: 'tab', label: 'Missing Tab Folder' },
        { id: 'node_def', type: 'function', z: 'tab_id_456', name: 'Lost Node', func: 'return;' }
    ];
    fs.writeFileSync(FLOWS_PATH, JSON.stringify(flows), 'utf8');

    // Create file with OLD metadata but MISSING tabId
    const filePath = path.join(SRC_DIR, 'lost-node.js');
    const content = `
module.exports = function (msg) { return; };
/* flows.json attributes
    "id": "node_def",
    "name": "Lost Node"
*/`;
    fs.writeFileSync(filePath, content, 'utf8');

    const migrateScript = path.resolve(process.cwd(), 'dist/migrate.js');
    execSync(`node ${migrateScript} --src ${SRC_DIR} --flows ${FLOWS_PATH}`);

    const expectedPath = path.join(SRC_DIR, 'missing-tab-folder', 'lost-node.js');
    assert.ok(fs.existsSync(expectedPath), `File should have moved to ${expectedPath}`);

    const migratedContent = fs.readFileSync(expectedPath, 'utf8');
    assert.ok(migratedContent.includes('@nr-z tab_id_456'), 'Container ID should have been resolved from flows.json');
});
