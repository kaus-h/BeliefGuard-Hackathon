import * as vscode from 'vscode';
/**
 * Safely reads a file from the workspace, preventing extension crashes
 * if the file is locked, missing, or unreadable.
 *
 * @param uri The URI of the file to read
 * @param maxLines Optional maximum number of lines to read to prevent memory overflows
 * @returns The contents of the file as a string, or null if unreadable.
 */
export declare function safeReadFile(uri: vscode.Uri, maxLines?: number): Promise<string | null>;
//# sourceMappingURL=fs.d.ts.map