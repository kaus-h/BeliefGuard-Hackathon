export declare const workspace: {
    workspaceFolders: never[];
    getConfiguration: () => {
        get: () => undefined;
    };
};
export declare const window: {
    showInformationMessage: () => void;
    showWarningMessage: () => void;
    showErrorMessage: () => void;
    showQuickPick: () => Promise<undefined>;
};
export declare const Uri: {
    file: (path: string) => {
        fsPath: string;
        scheme: string;
    };
    parse: (uri: string) => {
        fsPath: string;
        scheme: string;
    };
};
export declare const commands: {
    executeCommand: () => Promise<void>;
    registerCommand: () => {
        dispose: () => void;
    };
};
export declare const EventEmitter: {
    new (): {
        event: () => void;
        fire(): void;
        dispose(): void;
    };
};
export declare const Range: {
    new (start: any, end: any): {
        start: any;
        end: any;
    };
};
export declare const Position: {
    new (line: number, character: number): {
        line: number;
        character: number;
    };
};
export declare const WorkspaceEdit: {
    new (): {
        replace(): void;
        insert(): void;
        delete(): void;
    };
};
export declare enum ViewColumn {
    One = 1,
    Two = 2,
    Three = 3
}
//# sourceMappingURL=vscode.d.ts.map