import * as vscode from 'vscode';

/**
 * Safely reads a file from the workspace, preventing extension crashes
 * if the file is locked, missing, or unreadable.
 * 
 * @param uri The URI of the file to read
 * @param maxLines Optional maximum number of lines to read to prevent memory overflows
 * @returns The contents of the file as a string, or null if unreadable.
 */
export async function safeReadFile(uri: vscode.Uri, maxLines?: number): Promise<string | null> {
    try {
        const uint8Array = await vscode.workspace.fs.readFile(uri);
        const content = new TextDecoder().decode(uint8Array);
        
        if (maxLines !== undefined && maxLines > 0) {
            const lines = content.split(/\r?\n/);
            if (lines.length > maxLines) {
                return lines.slice(0, maxLines).join('\n');
            }
        }
        return content;
    } catch (error) {
        console.warn(`[BeliefGuard] Failed to read file ${uri.fsPath}:`, error);
        return null;
    }
}
