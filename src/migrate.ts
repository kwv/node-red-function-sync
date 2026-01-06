#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
    METADATA_REGEX,
    JSDOC_METADATA_REGEX,
    getMetadata,
    wrapScriptContent,
    prepareScriptContent
} from './utils.js';

const options = {
    src: { type: 'string' as const, default: 'src' },
    flows: { type: 'string' as const },
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
Usage: nr-migrate [options]

Migrate Node-RED function scripts from JSON metadata to JSDoc format.

Options:
  --src <path>     Directory to scan for scripts (default: src)
  --flows <path>   Optional: Path to flows.json to organize files into named folders
  -h, --help       Show this help message
`);
    process.exit(0);
}

const SRC_DIR = path.resolve(process.cwd(), values.src);
const FLOWS_PATH = values.flows ? path.resolve(process.cwd(), values.flows) : null;

function sanitize(name: string): string {
    return name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function migrate() {
    console.log(`🔍 Scanning ${SRC_DIR} for scripts to migrate...`);
    if (!fs.existsSync(SRC_DIR)) {
        console.error(`❌ Source directory not found: ${SRC_DIR}`);
        process.exit(1);
    }

    let flows: any[] = [];
    const tabMap = new Map<string, string>();
    const nodeZMap = new Map<string, string>();

    if (FLOWS_PATH && fs.existsSync(FLOWS_PATH)) {
        try {
            flows = JSON.parse(fs.readFileSync(FLOWS_PATH, 'utf8'));
            flows.forEach(n => {
                if (n.type === 'tab') tabMap.set(n.id, n.label || 'unnamed');
                else if (n.type === 'subflow') tabMap.set(n.id, n.name || 'unnamed');

                if (n.type === 'function') nodeZMap.set(n.id, n.z);
            });
            console.log(`✅ Loaded ${flows.length} nodes from flows.json for organization.`);
        } catch (e) {
            console.warn(`⚠️ Warning: Failed to load flows.json: ${e}`);
        }
    }

    let totalScanned = 0;
    let migratedCount = 0;
    let movedCount = 0;

    function walk(dir: string) {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filepath = path.join(dir, file);
            const stat = fs.statSync(filepath);

            if (stat.isDirectory()) {
                walk(filepath);
            } else if ((file.endsWith('.js') || file.endsWith('.ts')) && !file.includes('.spec.') && !file.includes('.test.')) {
                totalScanned++;
                const content = fs.readFileSync(filepath, 'utf8');

                // 1. Resolve metadata
                let meta = getMetadata(content);
                const hasJSDoc = !!content.match(JSDOC_METADATA_REGEX);
                const hasOld = !!content.match(METADATA_REGEX);

                if (!meta) continue;

                // 2. If info is missing, try to find it in flows
                if (nodeZMap.has(meta.id)) {
                    const realZ = nodeZMap.get(meta.id)!;
                    if (!meta.z || meta.z === '') {
                        meta.z = realZ;
                    }
                }

                // 3. Skip if we STILL don't have a container ID
                // We don't want to guestimate 'global' if we can't be sure.
                if (!meta.z) {
                    console.warn(`⚠️ Skipping ${path.relative(SRC_DIR, filepath)}: Container ID (z) unknown.`);
                    continue;
                }

                // 4. Migrate content if needed
                let currentContent = content;
                if (!hasJSDoc && hasOld) {
                    console.log(`🚚 Migrating metadata for ${path.relative(SRC_DIR, filepath)}...`);
                    const pureFunc = prepareScriptContent(content);
                    currentContent = wrapScriptContent(meta.id, meta.name || '', pureFunc, meta.z);
                    fs.writeFileSync(filepath, currentContent, 'utf8');
                    migratedCount++;
                }

                // 5. Reorganize if flows provided
                if (FLOWS_PATH) {
                    const tabName = tabMap.get(meta.z) || 'global';
                    const targetDir = path.join(SRC_DIR, sanitize(tabName));
                    const targetPath = path.join(targetDir, file);

                    if (path.resolve(filepath) !== path.resolve(targetPath)) {
                        console.log(`📂 Moving ${path.relative(SRC_DIR, filepath)} -> ${path.relative(SRC_DIR, targetPath)}`);
                        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
                        fs.renameSync(filepath, targetPath);
                        movedCount++;
                    }
                }
            }
        }
    }

    walk(SRC_DIR);
    console.log(`\n✨ Finished. Scanned ${totalScanned} files.`);
    if (migratedCount > 0) console.log(`✅ Migrated content for: ${migratedCount} files`);
    if (movedCount > 0) console.log(`✅ Moved to named folders: ${movedCount} files`);

    if (migratedCount > 0 || movedCount > 0) {
        console.log("\nCheck your files and commit the changes.");
    }
}

migrate();
