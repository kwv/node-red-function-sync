import fs from 'node:fs';
import path from 'node:path';

// Regex for Metadata
// Matches /* flows.json attributes ... */ block anywhere in the file (header or footer)
export const METADATA_REGEX = /\/\*\s*flows\.json (?:attributes|metadata)([\s\S]*?)\*\//;

export interface Metadata {
    id: string;
    name?: string;
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
                    const match = content.match(METADATA_REGEX);

                    if (match) {
                        let metaStr = match[1]?.trim() || '';
                        if (!metaStr) continue;
                        if (!metaStr.startsWith('{')) {
                            metaStr = `{${metaStr}}`;
                        }
                        metaStr = metaStr.replace(/,\s*}/g, '}');

                        try {
                            const meta = JSON.parse(metaStr) as Metadata;
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

export function getMetadata(content: string): Metadata | null {
    const match = content.match(METADATA_REGEX);
    if (!match) return null;

    let metaStr = match[1]?.trim() || '';
    if (!metaStr) return null;
    if (!metaStr.startsWith('{')) {
        metaStr = `{${metaStr}}`;
    }
    metaStr = metaStr.replace(/,\s*}/g, '}');

    try {
        return JSON.parse(metaStr) as Metadata;
    } catch (e) {
        return null;
    }
}

export function prepareScriptContent(rawContent: string): string {
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

export function wrapScriptContent(nodeId: string, nodeName: string, funcBody: string): string {
    const indentedBody = funcBody.split('\n').map((line: string) => (line.trim() ? '    ' + line : line)).join('\n');

    return `module.exports = function (msg, flow, env, node, global, context) {
${indentedBody}
};

/* flows.json attributes
    "id": "${nodeId}",
    "name": "${nodeName || ''}"
*/
`.trim() + '\n';
}
