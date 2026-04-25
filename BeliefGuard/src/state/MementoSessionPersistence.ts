import * as vscode from 'vscode';
import { SessionStore, SessionStoreSnapshot } from './SessionStore';

const DEFAULT_STORAGE_KEY = 'beliefguard.sessionSnapshot';

/**
 * VS Code backed persistence adapter for the otherwise VS-Code-free
 * SessionStore. Keeping this adapter thin preserves unit-testability while
 * allowing the extension to save graph snapshots across host restarts.
 */
export class MementoSessionPersistence {
    constructor(
        private readonly memento: vscode.Memento,
        private readonly key = DEFAULT_STORAGE_KEY
    ) { }

    public async save(store: SessionStore): Promise<void> {
        await this.memento.update(this.key, store.toSnapshot());
    }

    public hydrate(store: SessionStore): boolean {
        const snapshot = this.memento.get<SessionStoreSnapshot>(this.key);
        if (!snapshot) {
            return false;
        }

        store.hydrate(snapshot);
        return true;
    }

    public async clear(): Promise<void> {
        await this.memento.update(this.key, undefined);
    }
}
