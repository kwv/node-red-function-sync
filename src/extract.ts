#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { buildIdMap, METADATA_REGEX, wrapScriptContent, Metadata } from './utils.js';

// Regex for Complexity Metrics
const COMPLEXITY_REGEX = /\b(if|else|for|while|case|catch|switch|do)\b|&&|\|\||\?/g;

// Parse CLI Arguments
const options = {
    flows: { type: 'string' as const, default: 'flows.json' },
    src: { type: 'string' as const, default: 'src' },
    scan: { type: 'boolean' as const },
    help: { type: 'boolean' as const, short: 'h' as const },
};

let values: any;
let positionals: string[];

try {
    const parsed = parseArgs({ options, allowPositionals: true });
    values = parsed.values;
    positionals = parsed.positionals;
} catch (e: any) {
    console.error(e.message);
    process.exit(1);
}

if (values.help) {
    console.log(`
Usage: nr-extract [options] [node_id]

Extract a Node-RED function node from flows.json to a local file.

Options:
  --flows <path>   Path to flows.json file (default: flows.json)
  --src <path>     Directory to scan for scripts (default: src)
  --scan           Scan flows.json for complex functions
  -h, --help       Show this help message

Arguments:
  node_id          The ID of the node to extract
`);
    process.exit(0);
}

const FLOWS_PATH = path.resolve(process.cwd(), values.flows);
const SRC_DIR = path.resolve(process.cwd(), values.src);

function calculateMetrics(code: string) {
    const lines = code.split('\n').filter(l => l.trim().length > 0);
    const loc = lines.length;

    // Heuristic complexity
    // Start at 1 for the function itself
    const matches = code.match(COMPLEXITY_REGEX);
    const complexity = 1 + (matches ? matches.length : 0);

    return { loc, complexity };
}

function scanFunctions(flows: any[], srcDir: string) {
    const exportedMap = buildIdMap(srcDir);
    const tabMap = new Map<string, string>();

    // Build Tab/Container Map
    flows.forEach(n => {
        if (n.type === 'tab') {
            tabMap.set(n.id, n.label || 'Unknown Tab');
        } else if (n.type === 'subflow') {
            tabMap.set(n.id, n.name || 'Unknown Subflow');
        }
    });

    const candidates: any[] = [];

    flows.forEach(node => {
        if (node.type !== 'function') return;

        const funcBody = node.func || '';
        if (!funcBody) return;

        const { loc, complexity } = calculateMetrics(funcBody);
        const isExported = exportedMap.has(node.id);
        const tabName = tabMap.get(node.z) || 'Global/Subflow';

        candidates.push({
            name: node.name || 'unnamed',
            id: node.id,
            loc,
            complexity,
            exported: isExported,
            tab: tabName
        });
    });

    // Sort by complexity descending
    candidates.sort((a, b) => b.complexity - a.complexity);

    console.log(`${'COMPLEXITY'.padEnd(12)} ${'LOC'.padEnd(8)} ${'EXPORTED'.padEnd(10)} ${'TAB'.padEnd(20)} ${'ID'.padEnd(18)} ${'NAME'}`);
    console.log('-'.repeat(100));

    candidates.slice(0, 20).forEach(c => {
        const exportedStr = c.exported ? 'YES' : '-';
        let tabStr = c.tab;
        if (tabStr.length > 18) {
            tabStr = tabStr.substring(0, 18) + '..';
        }

        console.log(`${String(c.complexity).padEnd(12)} ${String(c.loc).padEnd(8)} ${exportedStr.padEnd(10)} ${tabStr.padEnd(20)} ${c.id.padEnd(18)} ${c.name}`);
    });
}

function findFileById(nodeId: string, rootDir: string): { filepath: string, content: string } | null {
    let result: { filepath: string, content: string } | null = null;

    function walk(dir: string) {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir);

        for (const file of files) {
            const filepath = path.join(dir, file);
            const stat = fs.statSync(filepath);

            if (stat.isDirectory()) {
                walk(filepath);
                if (result) return;
            } else if (file.endsWith('.js') || file.endsWith('.ts')) {
                try {
                    const content = fs.readFileSync(filepath, 'utf8');
                    const match = content.match(METADATA_REGEX);
                    if (match) {
                        const metaStr = match[1]?.trim() || '';
                        if (!metaStr) continue;
                        let finalMetaStr = metaStr;
                        if (!finalMetaStr.startsWith('{')) finalMetaStr = `{${finalMetaStr}}`;
                        finalMetaStr = finalMetaStr.replace(/,\s*}/g, '}');
                        const meta = JSON.parse(finalMetaStr);

                        if (meta.id === nodeId) {
                            result = { filepath, content };
                            return;
                        }
                    }
                } catch (e) {
                    // ignore
                }
            }
        }
    }

    walk(rootDir);
    return result;
}

function updateFileContent(nodeId: string, filepath: string, originalContent: string, newFuncBody: string, z: string) {
    const newContent = wrapScriptContent(nodeId, '', newFuncBody, z);
    fs.writeFileSync(filepath, newContent.trim() + '\n', 'utf8');
    return true;
}

function sanitize(name: string): string {
    return name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function run() {
    let flows: any[];
    try {
        const flowsContent = fs.readFileSync(FLOWS_PATH, 'utf8');
        flows = JSON.parse(flowsContent);
    } catch (err) {
        console.error(`❌ ${FLOWS_PATH} not found!`);
        process.exit(1);
    }

    if (values.scan) {
        scanFunctions(flows, SRC_DIR);
        return;
    }

    let nodeId = positionals[0];
    if (nodeId && nodeId.includes('=')) {
        const parts = nodeId.split('=');
        if (parts[0] === 'node_id') {
            nodeId = parts[1];
        }
    }

    if (!nodeId) {
        console.error("Error: node_id is required unless --scan is used");
        process.exit(1);
    }

    const targetNode = flows.find(n => n.id === nodeId);
    if (!targetNode) {
        console.error(`❌ Node ID ${nodeId} not found in flows.json`);
        process.exit(1);
    }

    // Build Tab/Container Map
    const tabMap = new Map<string, string>();
    flows.forEach(n => {
        if (n.type === 'tab') {
            tabMap.set(n.id, n.label || 'unnamed');
        } else if (n.type === 'subflow') {
            tabMap.set(n.id, n.name || 'unnamed');
        }
    });

    console.log(`✅ Found node: '${targetNode.name || 'unnamed'}' (${nodeId})`);

    const tabName = tabMap.get(targetNode.z) || 'global';
    const nodeName = targetNode.name || nodeId;
    const targetFilename = `${sanitize(nodeName)}.js`;
    const targetDir = path.join(SRC_DIR, sanitize(tabName));
    const targetPath = path.join(targetDir, targetFilename);

    console.log(`🔍 Searching ${SRC_DIR} for existing file...`);

    if (!fs.existsSync(SRC_DIR)) {
        fs.mkdirSync(SRC_DIR, { recursive: true });
    }

    const fileInfo = findFileById(nodeId, SRC_DIR);
    const funcContent = targetNode.func || '';

    if (fileInfo) {
        let currentPath = fileInfo.filepath;
        if (path.resolve(currentPath) !== path.resolve(targetPath)) {
            console.log(`🚚 Moving file from ${path.relative(SRC_DIR, currentPath)} to ${path.relative(SRC_DIR, targetPath)}`);
            if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
            fs.renameSync(currentPath, targetPath);
            currentPath = targetPath;
        }

        console.log(`📂 Target file: ${currentPath}`);
        if (updateFileContent(nodeId, currentPath, fileInfo.content, funcContent, targetNode.z)) {
            console.log(`💾 Successfully updated ${path.relative(SRC_DIR, currentPath)}`);
        } else {
            console.error("❌ Failed to update file.");
        }
    } else {
        // File doesn't exist, create it
        console.log(`✨ Creating new file at ${path.relative(SRC_DIR, targetPath)}...`);

        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        const initialContent = wrapScriptContent(nodeId, targetNode.name || '', funcContent, targetNode.z);

        try {
            fs.writeFileSync(targetPath, initialContent, 'utf8');
            console.log(`💾 Created ${path.relative(SRC_DIR, targetPath)}`);
        } catch (e: any) {
            console.error(`❌ Failed to create file: ${e.message}`);
            process.exit(1);
        }
    }
}

run();
