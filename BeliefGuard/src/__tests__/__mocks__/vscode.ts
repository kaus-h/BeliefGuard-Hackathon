// Minimal vscode mock for unit tests
export const workspace = {
    workspaceFolders: [],
    getConfiguration: () => ({ get: () => undefined }),
};
export const window = {
    showInformationMessage: () => {},
    showWarningMessage: () => {},
    showErrorMessage: () => {},
    showQuickPick: () => Promise.resolve(undefined),
};
export const Uri = {
    file: (path: string) => ({ fsPath: path, scheme: 'file' }),
    parse: (uri: string) => ({ fsPath: uri, scheme: 'file' }),
};
export const commands = {
    executeCommand: () => Promise.resolve(),
    registerCommand: () => ({ dispose: () => {} }),
};
export const EventEmitter = class {
    event = () => {};
    fire() {}
    dispose() {}
};
export const Range = class {
    constructor(public start: any, public end: any) {}
};
export const Position = class {
    constructor(public line: number, public character: number) {}
};
export const WorkspaceEdit = class {
    replace() {}
    insert() {}
    delete() {}
};
export enum ViewColumn { One = 1, Two = 2, Three = 3 }
