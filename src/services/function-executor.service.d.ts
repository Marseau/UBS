import {
  FunctionCall,
  FunctionResult,
  ConversationContext,
  AIFunction,
} from "../types/ai.types";
export declare class FunctionExecutorService {
  private executionHistory;
  private rateLimits;
  executeFunction(
    functionCall: FunctionCall,
    functionDef: AIFunction,
    context: ConversationContext,
  ): Promise<FunctionResult>;
  executeFunctionChain(
    functionCalls: FunctionCall[],
    functions: AIFunction[],
    context: ConversationContext,
  ): Promise<FunctionResult[]>;
  private validateParameters;
  private validateParameterType;
  private checkRateLimit;
  private updateRateLimit;
  private generateExecutionId;
  private addToExecutionHistory;
  private getExecutionById;
  private logFunctionExecution;
  private getErrorMessage;
  getExecutionStats(sessionId?: string): ExecutionStats;
  private calculateStats;
  clearExecutionHistory(sessionId: string): void;
  clearRateLimits(): void;
}
interface ExecutionStats {
  total: number;
  successful: number;
  failed: number;
  errors: number;
  successRate: number;
  avgDuration: number;
  functionUsage: Record<string, number>;
}
export default FunctionExecutorService;
//# sourceMappingURL=function-executor.service.d.ts.map
