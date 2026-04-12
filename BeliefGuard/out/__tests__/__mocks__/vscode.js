"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ViewColumn = exports.WorkspaceEdit = exports.Position = exports.Range = exports.EventEmitter = exports.commands = exports.Uri = exports.window = exports.workspace = void 0;
// Minimal vscode mock for unit tests
exports.workspace = {
    workspaceFolders: [],
    getConfiguration: () => ({ get: () => undefined }),
};
exports.window = {
    showInformationMessage: () => { },
    showWarningMessage: () => { },
    showErrorMessage: () => { },
    showQuickPick: () => Promise.resolve(undefined),
};
exports.Uri = {
    file: (path) => ({ fsPath: path, scheme: 'file' }),
    parse: (uri) => ({ fsPath: uri, scheme: 'file' }),
};
exports.commands = {
    executeCommand: () => Promise.resolve(),
    registerCommand: () => ({ dispose: () => { } }),
};
const EventEmitter = class {
    event = () => { };
    fire() { }
    dispose() { }
};
exports.EventEmitter = EventEmitter;
const Range = class {
    start;
    end;
    constructor(start, end) {
        this.start = start;
        this.end = end;
    }
};
exports.Range = Range;
const Position = class {
    line;
    character;
    constructor(line, character) {
        this.line = line;
        this.character = character;
    }
};
exports.Position = Position;
const WorkspaceEdit = class {
    replace() { }
    insert() { }
    delete() { }
};
exports.WorkspaceEdit = WorkspaceEdit;
var ViewColumn;
(function (ViewColumn) {
    ViewColumn[ViewColumn["One"] = 1] = "One";
    ViewColumn[ViewColumn["Two"] = 2] = "Two";
    ViewColumn[ViewColumn["Three"] = 3] = "Three";
})(ViewColumn || (exports.ViewColumn = ViewColumn = {}));
//# sourceMappingURL=vscode.js.map