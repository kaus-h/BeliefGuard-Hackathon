import * as vscode from 'vscode';
import { SessionStore } from './SessionStore';
/**
 * VS Code backed persistence adapter for the otherwise VS-Code-free
 * SessionStore. Keeping this adapter thin preserves unit-testability while
 * allowing the extension to save graph snapshots across host restarts.
 */
export declare class MementoSessionPersistence {
    private readonly memento;
    private readonly key;
    constructor(memento: vscode.Memento, key?: string);
    save(store: SessionStore): Promise<void>;
    hydrate(store: SessionStore): boolean;
    clear(): Promise<void>;
}
//# sourceMappingURL=MementoSessionPersistence.d.ts.map