"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryService = void 0;
class MemoryService {
    constructor(memoryTtl = 3600) {
        this.sessions = new Map();
        this.memoryTtl = memoryTtl * 1000;
    }
    async getMemoryManager(sessionId) {
        let manager = this.sessions.get(sessionId);
        if (!manager) {
            manager = new SessionMemoryManager(sessionId, this.memoryTtl);
            this.sessions.set(sessionId, manager);
        }
        return manager;
    }
    clearExpiredSessions() {
        const now = Date.now();
        for (const [sessionId, manager] of this.sessions.entries()) {
            if (manager instanceof SessionMemoryManager && manager.isExpired(now)) {
                this.sessions.delete(sessionId);
            }
        }
    }
    getActiveSessionCount() {
        return this.sessions.size;
    }
    clearAllSessions() {
        this.sessions.clear();
    }
    getStats() {
        const now = Date.now();
        let activeSessions = 0;
        for (const manager of this.sessions.values()) {
            if (manager instanceof SessionMemoryManager && !manager.isExpired(now)) {
                activeSessions++;
            }
        }
        return {
            totalSessions: this.sessions.size,
            activeSessions
        };
    }
}
exports.MemoryService = MemoryService;
class SessionMemoryManager {
    constructor(sessionId, ttl) {
        this.sessionId = sessionId;
        this.ttl = ttl;
        this.lastAccess = Date.now();
        this.lastAccessed = new Date();
        this.shortTermMemory = [];
        this.longTermMemory = [];
        this.context = {};
        this.storage = {
            shortTerm: new Map(),
            longTerm: new Map(),
            context: this.context
        };
    }
    async store(key, value, type) {
        this.updateLastAccess();
        const targetMap = type === 'short' ? this.storage.shortTerm : this.storage.longTerm;
        const targetArray = type === 'short' ? this.shortTermMemory : this.longTermMemory;
        const timestamp = new Date();
        if (type === 'short') {
            targetMap.set(key, {
                value,
                timestamp: Date.now(),
                ttl: 1800000
            });
        }
        else {
            targetMap.set(key, { value, timestamp: Date.now() });
        }
        const existingIndex = targetArray.findIndex(item => item.key === key);
        if (existingIndex >= 0) {
            targetArray[existingIndex] = { key, value, timestamp };
        }
        else {
            targetArray.push({ key, value, timestamp });
        }
    }
    async retrieve(key, type) {
        this.updateLastAccess();
        const targetMap = type === 'short' ? this.storage.shortTerm : this.storage.longTerm;
        const entry = targetMap.get(key);
        if (!entry)
            return null;
        if (type === 'short' && entry.ttl) {
            const now = Date.now();
            if (now - entry.timestamp > entry.ttl) {
                targetMap.delete(key);
                return null;
            }
        }
        return entry.value;
    }
    async clear(type) {
        this.updateLastAccess();
        switch (type) {
            case 'short':
                this.storage.shortTerm.clear();
                break;
            case 'long':
                this.storage.longTerm.clear();
                break;
            case 'all':
                this.storage.shortTerm.clear();
                this.storage.longTerm.clear();
                this.storage.context = {};
                break;
        }
    }
    getContext() {
        this.updateLastAccess();
        return this.storage.context;
    }
    async updateContext(updates) {
        this.updateLastAccess();
        this.storage.context = { ...this.storage.context, ...updates };
        await this.store('last_context_update', {
            timestamp: Date.now(),
            updates: Object.keys(updates)
        }, 'long');
    }
    isExpired(currentTime) {
        return currentTime - this.lastAccess > this.ttl;
    }
    updateLastAccess() {
        this.lastAccess = Date.now();
        this.lastAccessed = new Date();
        if (Math.random() < 0.1) {
            this.cleanExpiredShortTerm();
        }
    }
    cleanExpiredShortTerm() {
        const now = Date.now();
        for (const [key, entry] of this.storage.shortTerm.entries()) {
            if (entry.ttl && now - entry.timestamp > entry.ttl) {
                this.storage.shortTerm.delete(key);
            }
        }
    }
}
//# sourceMappingURL=memory.service.js.map