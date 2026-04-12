"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.gatherInitialContext = gatherInitialContext;
const vscode = __importStar(require("vscode"));
const fs_1 = require("../utils/fs");
async function gatherInitialContext() {
    let contextBuilder = '# Workspace Context\n\n';
    // 1. Directory Structure (Max 3 levels deep)
    contextBuilder += '## Directory Structure\n';
    contextBuilder += '```\n';
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        const rootPath = vscode.workspace.workspaceFolders[0].uri;
        const treeText = await buildDirectoryTree(rootPath, 0, 3);
        contextBuilder += treeText || '(Empty Workspace)\n';
    }
    else {
        contextBuilder += '(No Workspace Open)\n';
    }
    contextBuilder += '```\n\n';
    // 2. Manifest Files
    contextBuilder += '## Configuration Manifests\n';
    const manifestsToFind = [
        '**/package.json',
        '**/tsconfig.json',
        '**/pom.xml',
        '**/requirements.txt'
    ];
    for (const pattern of manifestsToFind) {
        try {
            // Find files, ignoring node_modules, etc.
            const files = await vscode.workspace.findFiles(pattern, '{**/node_modules/**,**/.git/**,**/dist/**}');
            for (const fileUri of files.slice(0, 5)) { // Limit to avoid giant output on monorepos
                const content = await (0, fs_1.safeReadFile)(fileUri, 1000); // 1000 line cap per spec
                if (content) {
                    const relativePath = vscode.workspace.asRelativePath(fileUri);
                    contextBuilder += `### ${relativePath}\n\`\`\`\n${content}\n\`\`\`\n\n`;
                }
            }
        }
        catch (e) {
            console.warn(`[BeliefGuard] Failed to find files for pattern ${pattern}`, e);
        }
    }
    // 3. Visible Text Editors
    contextBuilder += '## Visible Active Documents\n';
    const activeEditors = vscode.window.visibleTextEditors;
    if (activeEditors.length === 0) {
        contextBuilder += 'No visible editors currently open.\n';
    }
    else {
        for (const editor of activeEditors) {
            const doc = editor.document;
            const relativePath = vscode.workspace.asRelativePath(doc.uri);
            const content = doc.getText();
            contextBuilder += `### ${relativePath}\n\`\`\`\n${content}\n\`\`\`\n\n`;
        }
    }
    return contextBuilder;
}
/**
 * Recursively builds a generic tree string representation of the directory.
 */
async function buildDirectoryTree(uri, currentLevel, maxLevel, prefix = '') {
    if (currentLevel >= maxLevel)
        return '';
    let tree = '';
    let entries = [];
    try {
        entries = await vscode.workspace.fs.readDirectory(uri);
    }
    catch (e) {
        return tree;
    }
    const ignoredDirs = new Set(['node_modules', '.git', 'dist', 'build', 'out']);
    // Filter out ignored directories BEFORE sorting so isLast is computed correctly
    const filtered = entries.filter(([name, type]) => {
        return !(type === vscode.FileType.Directory && ignoredDirs.has(name));
    });
    // Sort entries to put directories first, then files alphabetically
    filtered.sort((a, b) => {
        if (a[1] === b[1])
            return a[0].localeCompare(b[0]);
        return a[1] === vscode.FileType.Directory ? -1 : 1;
    });
    for (let i = 0; i < filtered.length; i++) {
        const [name, type] = filtered[i];
        const isLast = i === filtered.length - 1;
        const pointer = isLast ? '└── ' : '├── ';
        tree += `${prefix}${pointer}${name}\n`;
        if (type === vscode.FileType.Directory) {
            const nextPrefix = prefix + (isLast ? '    ' : '│   ');
            const subUri = vscode.Uri.joinPath(uri, name);
            tree += await buildDirectoryTree(subUri, currentLevel + 1, maxLevel, nextPrefix);
        }
    }
    return tree;
}
//# sourceMappingURL=WorkspaceScanner.js.map