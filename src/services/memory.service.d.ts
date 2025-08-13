import { MemoryManager } from "../types/ai.types";
export declare class MemoryService {
  private sessions;
  private memoryTtl;
  constructor(memoryTtl?: number);
  getMemoryManager(sessionId: string): Promise<MemoryManager>;
  clearExpiredSessions(): void;
  getActiveSessionCount(): number;
  clearAllSessions(): void;
  getStats(): {
    totalSessions: number;
    activeSessions: number;
  };
}
//# sourceMappingURL=memory.service.d.ts.map
