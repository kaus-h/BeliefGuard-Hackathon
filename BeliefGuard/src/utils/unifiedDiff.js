"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeUnifiedDiffText = normalizeUnifiedDiffText;
exports.parseUnifiedDiff = parseUnifiedDiff;
exports.applyUnifiedDiffToText = applyUnifiedDiffToText;
exports.findMatchingDiffChange = findMatchingDiffChange;
exports.resolveWorkspaceRelativePath = resolveWorkspaceRelativePath;
exports.getUnifiedDiffChangePath = getUnifiedDiffChangePath;
exports.summarizeUnifiedDiff = summarizeUnifiedDiff;
exports.applyUnifiedDiffToWorkspace = applyUnifiedDiffToWorkspace;
var vscode = require("vscode");
function normalizeUnifiedDiffText(input) {
    var trimmed = input.trim();
    var withoutFence = trimmed
        .replace(/^```(?:diff)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
    var diffStart = withoutFence.search(/^(diff --git|---\s+)/m);
    return diffStart >= 0 ? withoutFence.slice(diffStart).trim() : withoutFence;
}
function parseUnifiedDiff(diffText) {
    var lines = normalizeUnifiedDiffText(diffText).split(/\r?\n/);
    var changes = [];
    var currentChange = null;
    var currentHunk = null;
    for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
        var line = lines_1[_i];
        if (line.startsWith('diff --git ')) {
            continue;
        }
        if (line.startsWith('--- ')) {
            if (currentChange) {
                changes.push(currentChange);
            }
            currentChange = {
                oldPath: cleanDiffPath(line.slice(4).trim()),
                newPath: null,
                hunks: [],
            };
            currentHunk = null;
            continue;
        }
        if (line.startsWith('+++ ')) {
            if (!currentChange) {
                currentChange = { oldPath: null, newPath: null, hunks: [] };
            }
            currentChange.newPath = cleanDiffPath(line.slice(4).trim());
            continue;
        }
        var hunkMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
        if (hunkMatch) {
            if (!currentChange) {
                throw new Error('Encountered a diff hunk before a file header.');
            }
            currentHunk = {
                oldStart: Number(hunkMatch[1]),
                oldCount: Number(hunkMatch[2] || '1'),
                newStart: Number(hunkMatch[3]),
                newCount: Number(hunkMatch[4] || '1'),
                lines: [],
            };
            currentChange.hunks.push(currentHunk);
            continue;
        }
        if (currentHunk && /^( |\+|-|\\)/.test(line)) {
            currentHunk.lines.push(line);
        }
    }
    if (currentChange) {
        changes.push(currentChange);
    }
    return changes;
}
function applyUnifiedDiffToText(originalContent, change) {
    var originalLines = splitLinesPreserveTrailingNewline(originalContent);
    var resultLines = __spreadArray([], originalLines, true);
    var lineOffset = 0;
    for (var _i = 0, _a = change.hunks; _i < _a.length; _i++) {
        var hunk = _a[_i];
        var expectedOldLines = [];
        var replacementLines = [];
        for (var _b = 0, _c = hunk.lines; _b < _c.length; _b++) {
            var line = _c[_b];
            if (!line || line.startsWith('\\')) {
                continue;
            }
            var marker = line[0];
            var value = line.slice(1);
            if (marker === ' ' || marker === '-') {
                expectedOldLines.push(value);
            }
            if (marker === ' ' || marker === '+') {
                replacementLines.push(value);
            }
        }
        var startIndex = Math.max(0, hunk.oldStart - 1 + lineOffset);
        var actualSlice = resultLines.slice(startIndex, startIndex + expectedOldLines.length);
        if (!arraysEqual(actualSlice, expectedOldLines)) {
            throw new Error("Unified diff hunk did not match file contents for ".concat(change.newPath || change.oldPath || 'unknown file', "."));
        }
        resultLines.splice.apply(resultLines, __spreadArray([startIndex,
            expectedOldLines.length], replacementLines, false));
        lineOffset += replacementLines.length - expectedOldLines.length;
    }
    return resultLines.join('\n');
}
function findMatchingDiffChange(changes, relativePath, workspaceFolder) {
    var normalized = relativePath.replace(/\\/g, '/');
    return changes.find(function (change) {
        var _a, _b, _c;
        var resolvedChangePath = workspaceFolder
            ? resolveWorkspaceRelativePath(workspaceFolder, (_a = change.newPath) !== null && _a !== void 0 ? _a : change.oldPath)
            : null;
        return (resolvedChangePath === normalized ||
            change.newPath === normalized ||
            change.oldPath === normalized ||
            ((_b = change.newPath) === null || _b === void 0 ? void 0 : _b.endsWith("/".concat(normalized))) ||
            ((_c = change.oldPath) === null || _c === void 0 ? void 0 : _c.endsWith("/".concat(normalized))));
    });
}
function resolveWorkspaceRelativePath(workspaceFolder, diffPath) {
    var normalized = cleanDiffPath(diffPath);
    if (!normalized) {
        return null;
    }
    var workspacePath = workspaceFolder.uri.fsPath.replace(/\\/g, '/');
    var workspaceName = workspaceFolder.name.replace(/\\/g, '/');
    var candidates = new Set();
    candidates.add(normalized);
    candidates.add(normalized.replace(/^\/+/, ''));
    candidates.add(normalized.replace(/^\.\//, ''));
    if (workspaceName) {
        candidates.add(normalized.replace(new RegExp("^".concat(escapeRegExp(workspaceName), "/")), ''));
    }
    var normalizedLower = normalized.toLowerCase();
    var workspaceLower = workspacePath.toLowerCase();
    if (normalizedLower.startsWith("".concat(workspaceLower, "/"))) {
        candidates.add(normalized.slice(workspacePath.length + 1));
    }
    for (var _i = 0, candidates_1 = candidates; _i < candidates_1.length; _i++) {
        var candidate = candidates_1[_i];
        var cleaned = candidate.replace(/^\/+/, '').replace(/\/+/g, '/');
        if (!cleaned) {
            continue;
        }
        if (cleaned.startsWith('../') || /^[A-Za-z]:/.test(cleaned)) {
            continue;
        }
        return cleaned;
    }
    return null;
}
function getUnifiedDiffChangePath(change, workspaceFolder) {
    var _a, _b, _c;
    var rawPath = (_b = (_a = change.newPath) !== null && _a !== void 0 ? _a : change.oldPath) !== null && _b !== void 0 ? _b : 'unknown';
    if (!workspaceFolder) {
        return rawPath;
    }
    return (_c = resolveWorkspaceRelativePath(workspaceFolder, rawPath)) !== null && _c !== void 0 ? _c : rawPath;
}
function summarizeUnifiedDiff(diffText) {
    var _a;
    var workspaceFolder = (_a = vscode.workspace.workspaceFolders) === null || _a === void 0 ? void 0 : _a[0];
    var changes = parseUnifiedDiff(diffText);
    var files = changes.map(function (change) {
        var path = getUnifiedDiffChangePath(change, workspaceFolder);
        var status = change.oldPath === null
            ? 'ADDED'
            : change.newPath === null
                ? 'DELETED'
                : 'MODIFIED';
        var additions = 0;
        var deletions = 0;
        for (var _i = 0, _a = change.hunks; _i < _a.length; _i++) {
            var hunk = _a[_i];
            for (var _b = 0, _c = hunk.lines; _b < _c.length; _b++) {
                var line = _c[_b];
                if (!line || line.startsWith('+++') || line.startsWith('---') || line.startsWith('\\')) {
                    continue;
                }
                if (line.startsWith('+')) {
                    additions++;
                }
                else if (line.startsWith('-')) {
                    deletions++;
                }
            }
        }
        return {
            path: path,
            status: status,
            additions: additions,
            deletions: deletions,
        };
    });
    return {
        fileCount: files.length,
        additions: files.reduce(function (sum, file) { return sum + file.additions; }, 0),
        deletions: files.reduce(function (sum, file) { return sum + file.deletions; }, 0),
        files: files,
    };
}
function applyUnifiedDiffToWorkspace(diffText) {
    return __awaiter(this, void 0, void 0, function () {
        var workspaceFolder, changes, edit, _i, changes_1, change, rawTargetPath, targetPath, targetUri, newContent_1, document_1, newContent, fullRange, applied;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    workspaceFolder = (_a = vscode.workspace.workspaceFolders) === null || _a === void 0 ? void 0 : _a[0];
                    if (!workspaceFolder) {
                        throw new Error('No workspace folder is open.');
                    }
                    changes = parseUnifiedDiff(diffText);
                    if (changes.length === 0) {
                        throw new Error('No valid unified diff changes were found.');
                    }
                    edit = new vscode.WorkspaceEdit();
                    _i = 0, changes_1 = changes;
                    _c.label = 1;
                case 1:
                    if (!(_i < changes_1.length)) return [3 /*break*/, 5];
                    change = changes_1[_i];
                    rawTargetPath = (_b = change.newPath) !== null && _b !== void 0 ? _b : change.oldPath;
                    targetPath = resolveWorkspaceRelativePath(workspaceFolder, rawTargetPath);
                    if (!targetPath) {
                        throw new Error("BeliefGuard could not resolve a workspace file path for diff target: ".concat(rawTargetPath !== null && rawTargetPath !== void 0 ? rawTargetPath : 'unknown file', "."));
                    }
                    targetUri = vscode.Uri.joinPath(workspaceFolder.uri, targetPath);
                    if (change.newPath === null) {
                        edit.deleteFile(targetUri, { ignoreIfNotExists: true });
                        return [3 /*break*/, 4];
                    }
                    return [4 /*yield*/, vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(workspaceFolder.uri, getDirectoryPath(targetPath)))];
                case 2:
                    _c.sent();
                    if (change.oldPath === null) {
                        edit.createFile(targetUri, { overwrite: true, ignoreIfExists: false });
                        newContent_1 = applyUnifiedDiffToText('', change);
                        edit.insert(targetUri, new vscode.Position(0, 0), newContent_1);
                        return [3 /*break*/, 4];
                    }
                    return [4 /*yield*/, vscode.workspace.openTextDocument(targetUri)];
                case 3:
                    document_1 = _c.sent();
                    newContent = applyUnifiedDiffToText(document_1.getText(), change);
                    fullRange = new vscode.Range(document_1.positionAt(0), document_1.positionAt(document_1.getText().length));
                    edit.replace(targetUri, fullRange, newContent);
                    _c.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 1];
                case 5: return [4 /*yield*/, vscode.workspace.applyEdit(edit)];
                case 6:
                    applied = _c.sent();
                    if (!applied) {
                        throw new Error('VS Code rejected the proposed patch edits.');
                    }
                    return [4 /*yield*/, vscode.workspace.saveAll()];
                case 7:
                    _c.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function cleanDiffPath(pathText) {
    if (!pathText) {
        return null;
    }
    var normalized = pathText
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .replace(/^([ab])\//, '')
        .replace(/\\/g, '/');
    return normalized === '/dev/null' ? null : normalized;
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function splitLinesPreserveTrailingNewline(content) {
    if (!content) {
        return [];
    }
    var lines = content.split(/\r?\n/);
    if (content.endsWith('\n')) {
        lines.pop();
    }
    return lines;
}
function arraysEqual(left, right) {
    if (left.length !== right.length) {
        return false;
    }
    return left.every(function (value, index) { return value === right[index]; });
}
function getDirectoryPath(filePath) {
    var lastSlash = filePath.lastIndexOf('/');
    return lastSlash === -1 ? '' : filePath.slice(0, lastSlash);
}
