#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');

// Regex for Metadata
const METADATA_REGEX = /\/\*\s*flows\.json (?:attributes|metadata)([\s\S]*?)\*\//;

// Regex for Complexity Metrics
const COMPLEXITY_REGEX = /\b(if|else|for|while|case|catch|switch|do)\b|&&|\|\||\?/g;

// Parse CLI Arguments
const options = {
    flows: { type: 'string', default: 'flows.json' },
    src: { type: 'string', default: 'src' },
    scan: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
};

try {
    var { values, positionals } = parseArgs({ options, allowPositionals: true });
} catch (e) {
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

function calculateMetrics(code) {
    const lines = code.split('\n').filter(l => l.trim().length > 0);
    const loc = lines.length;

    // Heuristic complexity
    // Start at 1 for the function itself
    const matches = code.match(COMPLEXITY_REGEX);
    const complexity = 1 + (matches ? matches.length : 0);

    return { loc, complexity };
}

function buildIdMap(rootDir) {
    const idMap = new Map();

    function walk(dir) {
        if (!fs.existsSync(dir)) return;
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
                        let metaStr = match[1].trim();
                        if (!metaStr.startsWith('{')) {
                            metaStr = `{${metaStr}}`;
                        }
                        metaStr = metaStr.replace(/,\s*}/g, '}');

                        try {
                            const meta = JSON.parse(metaStr);
                            if (meta.id) {
                                idMap.set(meta.id, filepath);
                            }
                        } catch (e) {
                            // ignore invalid json during scan
                        }
                    }
                } catch (e) {
                    // ignore read errors
                }
            }
        }
    }

    walk(rootDir);
    return idMap;
}

function scanFunctions(flows, srcDir) {
    const exportedMap = buildIdMap(srcDir);
    const tabMap = new Map();

    // Build Tab Map
    flows.forEach(n => {
        if (n.type === 'tab') {
            tabMap.set(n.id, n.label || 'Unknown Tab');
        }
    });

    const candidates = [];

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

function findFileById(nodeId, rootDir) {
    let result = null;

    function walk(dir) {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir);

        for (const file of files) {
            const filepath = path.join(dir, file);
            const stat = fs.statSync(filepath);

            if (stat.isDirectory()) {
                walk(filepath);
                if (result) return;
            } else if (file.endsWith('.js')) {
                try {
                    const content = fs.readFileSync(filepath, 'utf8');
                    const match = content.match(METADATA_REGEX);
                    if (match) {
                        let metaStr = match[1].trim();
                        if (!metaStr.startsWith('{')) metaStr = `{${metaStr}}`;
                        metaStr = metaStr.replace(/,\s*}/g, '}');
                        const meta = JSON.parse(metaStr);

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

function updateFileContent(filepath, originalContent, newFuncBody) {
    const match = originalContent.match(METADATA_REGEX);
    if (!match) {
        console.error("Error: Metadata block lost during processing.");
        return false;
    }

    const metadataBlock = match[0];

    const indentedBody = newFuncBody.split('\n').map(line => '    ' + line).join('\n');

    const newContent = `module.exports = function (msg, flow, env, node, global, context) {
${indentedBody}
};

${metadataBlock}
`;

    fs.writeFileSync(filepath, newContent.trim() + '\n', 'utf8');
    return true;
}

function run() {
    let flows;
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

    const nodeId = positionals[0];
    if (!nodeId) {
        console.error("Error: node_id is required unless --scan is used");
        process.exit(1);
    }

    const targetNode = flows.find(n => n.id === nodeId);
    if (!targetNode) {
        console.error(`❌ Node ID ${nodeId} not found in flows.json`);
        process.exit(1);
    }

    console.log(`✅ Found node: '${targetNode.name || 'unnamed'}' (${nodeId})`);
    console.log(`🔍 Searching ${SRC_DIR} for existing file...`);

    if (!fs.existsSync(SRC_DIR)) {
        console.error(`❌ Source directory not found: ${SRC_DIR}`);
        process.exit(1);
    }

    const fileInfo = findFileById(nodeId, SRC_DIR);
    if (fileInfo) {
        console.log(`📂 Target file: ${fileInfo.filepath}`);
        const funcContent = targetNode.func || '';
        if (updateFileContent(fileInfo.filepath, fileInfo.content, funcContent)) {
            console.log(`💾 Successfully updated ${path.basename(fileInfo.filepath)}`);
        } else {
            console.error("❌ Failed to update file.");
        }
    } else {
        // File doesn't exist, create it
        console.log(`✨ Creating new file for node '${targetNode.name || nodeId}'...`);

        // Determine filename
        let filename = (targetNode.name || nodeId).toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        if (!filename) filename = nodeId;
        if (!filename.endsWith('.js')) filename += '.js';

        const filepath = path.join(SRC_DIR, filename);

        // Ensure src dir exists (we checked it earlier but good to be sure)
        if (!fs.existsSync(SRC_DIR)) fs.mkdirSync(SRC_DIR, { recursive: true });

        // Construct initial content
        const funcContent = targetNode.func || '';
        const indentedBody = funcContent.split('\n').map(line => '    ' + line).join('\n');

        const initialContent = `module.exports = function (msg, flow, env, node, global, context) {
${indentedBody}
};

/* flows.json attributes
    "id": "${nodeId}",
    "name": "${targetNode.name || ''}"
*/`;

        try {
            fs.writeFileSync(filepath, initialContent, 'utf8');
            console.log(`💾 Created ${path.basename(filepath)}`);
        } catch (e) {
            console.error(`❌ Failed to create file: ${e.message}`);
            process.exit(1);
        }
    }
}

run();
