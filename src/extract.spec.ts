import { test, after, before } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const TEST_DIR = path.resolve(process.cwd(), 'test-extract');
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

test('Extraction organization by tab', () => {
    const flows = [
        { id: 'tab1', type: 'tab', label: 'Main Tab' },
        { id: 'node1', type: 'function', z: 'tab1', name: 'My Function', func: 'return msg;' }
    ];
    fs.writeFileSync(FLOWS_PATH, JSON.stringify(flows), 'utf8');

    // Run the compiled extract script
    // Note: We use the already built dist/extract.js
    const extractScript = path.resolve(process.cwd(), 'dist/extract.js');
    execSync(`node ${extractScript} --flows ${FLOWS_PATH} --src ${SRC_DIR} node1`);

    const expectedPath = path.join(SRC_DIR, 'main-tab', 'my-function.js');
    assert.ok(fs.existsSync(expectedPath), `File should exist at ${expectedPath}`);

    const content = fs.readFileSync(expectedPath, 'utf8');
    assert.ok(content.includes('return msg;'), 'Content should include function body');
    assert.ok(content.includes('"id": "node1"'), 'Content should include node ID');
});

test('Extraction handles missing tab (default to global)', () => {
    const flows = [
        { id: 'node2', type: 'function', z: 'unknown-tab', name: 'Global Func', func: 'console.log("hi");' }
    ];
    fs.writeFileSync(FLOWS_PATH, JSON.stringify(flows), 'utf8');

    const extractScript = path.resolve(process.cwd(), 'dist/extract.js');
    execSync(`node ${extractScript} --flows ${FLOWS_PATH} --src ${SRC_DIR} node2`);

    const expectedPath = path.join(SRC_DIR, 'global', 'global-func.js');
    assert.ok(fs.existsSync(expectedPath), `File should exist at ${expectedPath}`);
});

test('Extraction organization by subflow', () => {
    const flows = [
        { id: 'sub1', type: 'subflow', name: 'My Subflow' },
        { id: 'node3', type: 'function', z: 'sub1', name: 'Subflow Func', func: 'return;' }
    ];
    fs.writeFileSync(FLOWS_PATH, JSON.stringify(flows), 'utf8');

    const extractScript = path.resolve(process.cwd(), 'dist/extract.js');
    execSync(`node ${extractScript} --flows ${FLOWS_PATH} --src ${SRC_DIR} node3`);

    const expectedPath = path.join(SRC_DIR, 'my-subflow', 'subflow-func.js');
    assert.ok(fs.existsSync(expectedPath), `File should exist at ${expectedPath}`);
});

test('Extraction moves existing file to new structure', () => {
    const flows = [
        { id: 'tab_move', type: 'tab', label: 'New Home' },
        { id: 'node_move', type: 'function', z: 'tab_move', name: 'Mover', func: 'return;' }
    ];
    fs.writeFileSync(FLOWS_PATH, JSON.stringify(flows), 'utf8');

    // Create file in old location (root of src)
    const oldPath = path.join(SRC_DIR, 'mover.js');
    const oldContent = `
module.exports = function (msg) { return; };
/* flows.json attributes
    "id": "node_move",
    "name": "Mover"
*/`;
    fs.writeFileSync(oldPath, oldContent, 'utf8');

    const extractScript = path.resolve(process.cwd(), 'dist/extract.js');
    execSync(`node ${extractScript} --flows ${FLOWS_PATH} --src ${SRC_DIR} node_move`);

    const newPath = path.join(SRC_DIR, 'new-home', 'mover.js');
    assert.ok(fs.existsSync(newPath), `File should have moved to ${newPath}`);
    assert.ok(!fs.existsSync(oldPath), 'Old file should no longer exist');
});
