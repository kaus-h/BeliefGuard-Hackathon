import * as vscode from 'vscode';
import type { PatchSummary } from '../types';
export interface UnifiedDiffChange {
    oldPath: string | null;
    newPath: string | null;
    hunks: UnifiedDiffHunk[];
}
interface UnifiedDiffHunk {
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    lines: string[];
}
export declare function normalizeUnifiedDiffText(input: string): string;
export declare function parseUnifiedDiff(diffText: string): UnifiedDiffChange[];
export declare function applyUnifiedDiffToText(originalContent: string, change: UnifiedDiffChange): string;
export declare function findMatchingDiffChange(changes: UnifiedDiffChange[], relativePath: string, workspaceFolder?: vscode.WorkspaceFolder): UnifiedDiffChange | undefined;
export declare function resolveWorkspaceRelativePath(workspaceFolder: vscode.WorkspaceFolder, diffPath: string | null): string | null;
export declare function getUnifiedDiffChangePath(change: UnifiedDiffChange, workspaceFolder?: vscode.WorkspaceFolder): string;
export declare function summarizeUnifiedDiff(diffText: string): PatchSummary;
export declare function applyUnifiedDiffToWorkspace(diffText: string): Promise<void>;
export {};
//# sourceMappingURL=unifiedDiff.d.ts.map