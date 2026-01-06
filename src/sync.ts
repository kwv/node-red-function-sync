#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { METADATA_REGEX, Metadata, prepareScriptContent, getMetadata } from './utils.js';

// Parse CLI Arguments
const options = {
    flows: { type: 'string' as const, default: 'flows.json' },
    src: { type: 'string' as const, default: 'src' },
    help: { type: 'boolean' as const, short: 'h' as const },
};

let values: any;
try {
    const parsed = parseArgs({ options });
    values = parsed.values;
} catch (e: any) {
    console.error(e.message);
    process.exit(1);
}

if (values.help) {
    console.log(`
Usage: nr-sync [options]

Synchronize local JavaScript files back into flows.json.

Options:
  --flows <path>   Path to flows.json file (default: flows.json)
  --src <path>     Directory to scan for scripts (default: src)
  -h, --help       Show this help message
`);
    process.exit(0);
}

const FLOWS_PATH = path.resolve(process.cwd(), values.flows);
const SRC_DIR = path.resolve(process.cwd(), values.src);

function scanScripts(rootDir: string) {
    const updates: Record<string, { file: string, name?: string, z: string, content: string }> = {};

    function walk(dir: string) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filepath = path.join(dir, file);
            const stat = fs.statSync(filepath);

            if (stat.isDirectory()) {
                walk(filepath);
            } else if (file.endsWith('.js') || file.endsWith('.ts')) {
                try {
                    const content = fs.readFileSync(filepath, 'utf8');
                    const meta = getMetadata(content);

                    if (meta && meta.id) {
                        updates[meta.id] = {
                            file: filepath,
                            name: meta.name,
                            z: meta.z,
                            content: content
                        };
                    }
                } catch (readErr: any) {
                    console.warn(`⚠️  Warning: Could not read ${file}: ${readErr.message}`);
                }
            }
        }
    }

    if (fs.existsSync(rootDir)) {
        walk(rootDir);
    }
    return updates;
}

// prepareScriptContent moved to utils.ts

function run() {
    console.log(`🔍 Scanning ${SRC_DIR} for scripts...`);
    if (!fs.existsSync(SRC_DIR)) {
        console.error(`❌ Source directory not found: ${SRC_DIR}`);
        process.exit(1);
    }

    const scriptUpdates = scanScripts(SRC_DIR);
    const updateCount = Object.keys(scriptUpdates).length;

    if (updateCount === 0) {
        console.log("No scripts with metadata found.");
        return;
    }

    console.log(`📂 Found ${updateCount} scripts to sync.`);
    console.log(`📖 Reading flows from: ${FLOWS_PATH}`);

    let flows: any[];
    try {
        const flowsContent = fs.readFileSync(FLOWS_PATH, 'utf8');
        flows = JSON.parse(flowsContent);
    } catch (err) {
        console.error(`❌ ${FLOWS_PATH} not found or invalid!`);
        process.exit(1);
    }

    let updatedCount = 0;
    const flowMap = new Map(flows.map(node => [node.id, node]));

    for (const [nodeId, data] of Object.entries(scriptUpdates)) {
        const node = flowMap.get(nodeId);

        if (!node) {
            console.warn(`⚠️  Node ID ${nodeId} not found in flows.json (File: ${path.basename(data.file)})`);
            continue;
        }

        const newFunc = prepareScriptContent(data.content);

        // Check if content or container has changed
        let changed = false;
        if (node.func !== newFunc) {
            console.log(`✅ Updating '${node.name || 'unnamed'}' (${nodeId}) code from ${path.basename(data.file)}`);
            node.func = newFunc;
            changed = true;
        }

        if (data.z && node.z !== data.z) {
            console.log(`🚚 Moving '${node.name || 'unnamed'}' (${nodeId}) to container ${data.z}`);
            node.z = data.z;
            changed = true;
        }

        if (changed) {
            updatedCount++;
        } else {
            console.log(`⏹️  Skipping '${node.name || 'unnamed'}' (${nodeId}) - Already up to date.`);
        }
    }

    if (updatedCount > 0) {
        console.log(`💾 Writing ${updatedCount} changes to ${FLOWS_PATH}...`);
        fs.writeFileSync(FLOWS_PATH, JSON.stringify(flows, null, 4), 'utf8');
        console.log("✨ Done. Please restart Node-RED.");
    } else {
        console.log("✨ All flows are already up to date.");
    }
}

run();
