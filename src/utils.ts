import fs from 'node:fs';
import path from 'node:path';

// Regex for Metadata
// Matches /* flows.json attributes ... */ block (old format)
export const METADATA_REGEX = /\/\*\s*flows\.json (?:attributes|metadata)([\s\S]*?)\*\//;

// Matches JSDoc-style tags (new format)
export const JSDOC_METADATA_REGEX = /\/\*\*\s*([\s\S]*?)\*\//;

export interface Metadata {
    id: string;
    name?: string;
    z: string;
}

export function buildIdMap(rootDir: string): Map<string, string> {
    const idMap = new Map<string, string>();

    function walk(dir: string) {
        if (!fs.existsSync(dir)) return;
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
                        idMap.set(meta.id, filepath);
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

export function getMetadata(content: string): Metadata | null {
    // 1. Try JSDoc format first (new)
    const jsdocMatch = content.match(JSDOC_METADATA_REGEX);
    if (jsdocMatch && jsdocMatch[1]) {
        const lines = jsdocMatch[1].split('\n');
        const meta: Partial<Metadata> = {};
        for (const line of lines) {
            const idMatch = line.match(/@nr-id\s+(.+)/);
            const nameMatch = line.match(/@nr-name\s+(.+)/);
            const zMatch = line.match(/@nr-z\s+(.+)/);

            if (idMatch && idMatch[1]) meta.id = idMatch[1].trim();
            if (nameMatch && nameMatch[1]) meta.name = nameMatch[1].trim();
            if (zMatch && zMatch[1]) meta.z = zMatch[1].trim();
        }
        if (meta.id && meta.z) return meta as Metadata;
    }

    // 2. Fallback to old JSON format (for migration)
    const oldMatch = content.match(METADATA_REGEX);
    if (oldMatch) {
        try {
            let metaStr = oldMatch[1]?.trim() || '';
            if (!metaStr) return null;
            if (!metaStr.startsWith('{')) metaStr = `{${metaStr}}`;
            metaStr = metaStr.replace(/,\s*}/g, '}');
            const data = JSON.parse(metaStr);
            // Support both 'z' and 'tabId' (user's specific request)
            return {
                id: data.id,
                name: data.name,
                z: data.z || data.tabId || ''
            };
        } catch (e) {
            return null;
        }
    }

    return null;
}

export function prepareScriptContent(rawContent: string): string {
    // 1. Remove metadata blocks
    let content = rawContent.replace(JSDOC_METADATA_REGEX, '').replace(METADATA_REGEX, '').trim();

    // 2. Strip module.exports wrapper
    // Regex matches: module.exports = function (...) {
    // We allow optional 'async' and whitespace variations
    const wrapperStartRegex = /module\.exports\s*=\s*(?:async\s+)?function\s*\([^)]*\)\s*\{/;
    const startMatch = content.match(wrapperStartRegex);

    if (startMatch) {
        // Strip everything before and including the function signature (dropping file-level comments)
        content = content.substring(startMatch.index! + startMatch[0].length);

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

export function wrapScriptContent(nodeId: string, nodeName: string, funcBody: string, z: string): string {
    const indentedBody = funcBody.split('\n').map((line: string) => (line.trim() ? '    ' + line : line)).join('\n');

    return `module.exports = function (msg, flow, env, node, global, context) {
${indentedBody}
};

/**
 * @nr-id ${nodeId}
 * @nr-name ${nodeName || ''}
 * @nr-z ${z}
 */
`.trim() + '\n';
}
