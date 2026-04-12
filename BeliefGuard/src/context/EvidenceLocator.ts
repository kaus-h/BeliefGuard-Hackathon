import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { Evidence } from '../types';
import { safeReadFile } from '../utils/fs';

/**
 * Heuristically locates evidence within the workspace for a given belief.
 */
export async function findEvidenceForBelief(beliefStatement: string, keywords: string[]): Promise<Evidence[]> {
    const evidenceArray: Evidence[] = [];
    const keywordList = keywords.map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
    
    // Heuristic 1: Frameworks -> package.json
    const frameworks = ['react', 'next.js', 'next', 'express', 'vue', 'angular', 'svelte', 'nestjs'];
    const hasFrameworkKeyword = keywordList.some(k => frameworks.includes(k));
    
    if (hasFrameworkKeyword) {
        try {
            const packageJsonFiles = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**');
            for (const fileUri of packageJsonFiles) {
                const content = await safeReadFile(fileUri, 1000);
                if (content) {
                    for (const fw of keywordList.filter(k => frameworks.includes(k))) {
                        // Check if the framework is in the package.json content (simplistic dependency check)
                        const fwMatchRegex = new RegExp(`"${fw}"\\s*:`, 'i');
                        if (fwMatchRegex.test(content)) {
                            // Extract snippet
                            const lines = content.split(/\r?\n/);
                            const matchLine = lines.find(l => fwMatchRegex.test(l)) || `"${fw}" dependency found`;
                            
                            evidenceArray.push({
                                id: generateUuid(),
                                sourceType: 'CONFIG',
                                uri: fileUri.toString(),
                                snippet: matchLine.trim(),
                                weight: 1.0 // High weight for config
                            });
                        }
                    }
                }
            }
        } catch (e) {
            console.warn(`[BeliefGuard] Error scanning package.json`, e);
        }
    }

    // Heuristic 2: Specific files (e.g. auth.ts, database.sql)
    const fileKeywords = keywordList.filter(k => k.includes('.') && k.length > 3);
    
    if (fileKeywords.length > 0) {
        for (const fileName of fileKeywords) {
            try {
                // Find restricted set of files matching this name exactly (ignoring path)
                const files = await vscode.workspace.findFiles(`**/${fileName}`, '**/node_modules/**');
                for (const fileUri of files.slice(0, 3)) { // Limit to 3 files to avoid overflow
                    const content = await safeReadFile(fileUri, 1000); // 1000 line cap per spec
                    if (content) {
                        // Scan for belief-relevant lines using keywords
                        const snippet = extractRelevantSnippet(content, beliefStatement, keywordList);
                        evidenceArray.push({
                            id: generateUuid(),
                            sourceType: 'FILE',
                            uri: fileUri.toString(),
                            snippet: snippet,
                            weight: 0.8 // Medium-high weight for actual source files
                        });
                    }
                }
            } catch (e) {
                console.warn(`[BeliefGuard] Error scanning file ${fileName}`, e);
            }
        }
    }
    
    return evidenceArray;
}

/**
 * Scans file content for lines relevant to a belief statement or its keywords.
 * Returns the most contextually useful snippet.
 */
function extractRelevantSnippet(content: string, beliefStatement: string, keywords: string[]): string {
    const lines = content.split(/\r?\n/);
    const matchedLines: { lineNum: number; text: string }[] = [];

    // Build a combined regex from non-file keywords (skip file names)
    const searchTerms = keywords
        .filter(k => !k.includes('.'))
        .concat(
            beliefStatement.toLowerCase().split(/\s+/).filter(w => w.length > 4)
        );

    if (searchTerms.length === 0) {
        // Fallback: just return the first 5 lines
        return lines.slice(0, 5).join('\n') + (lines.length > 5 ? '\n...' : '');
    }

    const searchRegex = new RegExp(searchTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');

    for (let i = 0; i < lines.length; i++) {
        if (searchRegex.test(lines[i])) {
            matchedLines.push({ lineNum: i + 1, text: lines[i].trim() });
            if (matchedLines.length >= 5) { break; } // Cap to 5 hits
        }
    }

    if (matchedLines.length === 0) {
        // No keyword hits — fall back to first 5 lines
        return lines.slice(0, 5).join('\n') + (lines.length > 5 ? '\n...' : '');
    }

    return matchedLines.map(m => `L${m.lineNum}: ${m.text}`).join('\n');
}

/**
 * Helper to generate a unique ID for Evidence nodes
 */
function generateUuid(): string {
    return uuidv4();
}
