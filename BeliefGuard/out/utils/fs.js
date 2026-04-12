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
exports.safeReadFile = safeReadFile;
const vscode = __importStar(require("vscode"));
/**
 * Safely reads a file from the workspace, preventing extension crashes
 * if the file is locked, missing, or unreadable.
 *
 * @param uri The URI of the file to read
 * @param maxLines Optional maximum number of lines to read to prevent memory overflows
 * @returns The contents of the file as a string, or null if unreadable.
 */
async function safeReadFile(uri, maxLines) {
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
    }
    catch (error) {
        console.warn(`[BeliefGuard] Failed to read file ${uri.fsPath}:`, error);
        return null;
    }
}
//# sourceMappingURL=fs.js.map