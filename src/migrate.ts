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
  -h, --help       Show this help message
`);
    process.exit(0);
}

const SRC_DIR = path.resolve(process.cwd(), values.src);

function migrate() {
    console.log(`🔍 Scanning ${SRC_DIR} for scripts to migrate...`);
    if (!fs.existsSync(SRC_DIR)) {
        console.error(`❌ Source directory not found: ${SRC_DIR}`);
        process.exit(1);
    }

    let totalScanned = 0;
    let migratedCount = 0;

    function walk(dir: string) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filepath = path.join(dir, file);
            const stat = fs.statSync(filepath);

            if (stat.isDirectory()) {
                walk(filepath);
            } else if ((file.endsWith('.js') || file.endsWith('.ts')) && !file.includes('.spec.') && !file.includes('.test.')) {
                totalScanned++;
                const content = fs.readFileSync(filepath, 'utf8');

                // Check if it already has JSDoc metadata
                if (content.match(JSDOC_METADATA_REGEX)) {
                    continue;
                }

                // Check if it has old metadata AND is a valid script (has the wrapper)
                const meta = getMetadata(content);
                const hasWrapper = content.includes('module.exports = function') || content.includes('module.exports = async function');

                if (meta && hasWrapper && content.match(METADATA_REGEX)) {
                    console.log(`🚚 Migrating ${path.relative(SRC_DIR, filepath)}...`);

                    const pureFunc = prepareScriptContent(content);
                    const newContent = wrapScriptContent(meta.id, meta.name || '', pureFunc, meta.z);

                    fs.writeFileSync(filepath, newContent, 'utf8');
                    migratedCount++;
                }
            }
        }
    }

    walk(SRC_DIR);
    console.log(`\n✨ Finished. Scanned ${totalScanned} files, migrated ${migratedCount} files.`);
    if (migratedCount > 0) {
        console.log("Check your files and commit the changes.");
    }
}

migrate();
