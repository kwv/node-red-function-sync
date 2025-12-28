#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');

// Regex for Metadata
// Matches /* flows.json attributes ... */ block anywhere in the file (header or footer)
const METADATA_REGEX = /\/\*\s*flows\.json (?:attributes|metadata)([\s\S]*?)\*\//;

// Parse CLI Arguments
const options = {
    flows: { type: 'string', default: 'flows.json' },
    src: { type: 'string', default: 'src' },
    help: { type: 'boolean', short: 'h' },
};

try {
    var { values } = parseArgs({ options });
} catch (e) {
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

function scanScripts(rootDir) {
    const updates = {};

    function walk(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filepath = path.join(dir, file);
            const stat = fs.statSync(filepath);

            if (stat.isDirectory()) {
                walk(filepath);
            } else if (file.endsWith('.js')) {
                try {
                    const content = fs.readFileSync(filepath, 'utf8');
                    const match = content.match(METADATA_REGEX);

                    if (match) {
                        try {
                            let metaStr = match[1].trim();
                            if (!metaStr.startsWith('{')) {
                                metaStr = `{${metaStr}}`;
                            }
                            // Cleanup trailing commas mostly
                            metaStr = metaStr.replace(/,\s*}/g, '}');

                            const meta = JSON.parse(metaStr);
                            const nodeId = meta.id;

                            if (nodeId) {
                                updates[nodeId] = {
                                    file: filepath,
                                    name: meta.name,
                                    content: content
                                };
                            }
                        } catch (parseErr) {
                            console.warn(`⚠️  Warning: Invalid metadata in ${file}: ${parseErr.message}`);
                        }
                    }
                } catch (readErr) {
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

function prepareScriptContent(rawContent) {
    // 1. Remove metadata block
    let content = rawContent.replace(METADATA_REGEX, '').trim();

    // 2. Strip module.exports wrapper
    // Regex matches: module.exports = function (...) {
    // We allow optional 'async' and whitespace variations
    const wrapperStartRegex = /^module\.exports\s*=\s*(?:async\s+)?function\s*\([^)]*\)\s*\{/;
    const startMatch = content.match(wrapperStartRegex);

    if (startMatch) {
        // Strip the header
        content = content.substring(startMatch[0].length);

        // Strip the trailing };
        // We find the last instance of };
        const lastBraceIdx = content.lastIndexOf('};');
        if (lastBraceIdx !== -1) {
            content = content.substring(0, lastBraceIdx);
        }
        return content.trim();
    }

    return content;
}

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

    let flows;
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

        // Check if content has changed
        if (node.func !== newFunc) {
            console.log(`✅ Updating '${node.name || 'unnamed'}' (${nodeId}) from ${path.basename(data.file)}`);
            node.func = newFunc;
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
