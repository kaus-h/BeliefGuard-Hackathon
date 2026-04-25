"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MementoSessionPersistence = void 0;
const DEFAULT_STORAGE_KEY = 'beliefguard.sessionSnapshot';
/**
 * VS Code backed persistence adapter for the otherwise VS-Code-free
 * SessionStore. Keeping this adapter thin preserves unit-testability while
 * allowing the extension to save graph snapshots across host restarts.
 */
class MementoSessionPersistence {
    memento;
    key;
    constructor(memento, key = DEFAULT_STORAGE_KEY) {
        this.memento = memento;
        this.key = key;
    }
    async save(store) {
        await this.memento.update(this.key, store.toSnapshot());
    }
    hydrate(store) {
        const snapshot = this.memento.get(this.key);
        if (!snapshot) {
            return false;
        }
        store.hydrate(snapshot);
        return true;
    }
    async clear() {
        await this.memento.update(this.key, undefined);
    }
}
exports.MementoSessionPersistence = MementoSessionPersistence;
//# sourceMappingURL=MementoSessionPersistence.js.map