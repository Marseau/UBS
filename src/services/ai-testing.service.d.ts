import { ConversationContext, IntentType } from "../types/ai.types";
import { BusinessDomain } from "../types/database.types";
interface TestScenario {
  id: string;
  name: string;
  domain: BusinessDomain | "other";
  description: string;
  messages: TestMessage[];
  expectedOutcomes: ExpectedOutcome[];
  context?: Partial<ConversationContext>;
}
interface TestMessage {
  id: string;
  text: string;
  type: "user" | "system";
  timestamp?: Date;
  media?: {
    type: "image" | "audio" | "document";
    url: string;
    caption?: string;
  };
}
interface ExpectedOutcome {
  type:
    | "intent"
    | "booking"
    | "response_quality"
    | "escalation"
    | "function_call";
  value: any;
  confidence?: number;
  description: string;
}
interface TestResult {
  scenario: TestScenario;
  success: boolean;
  score: number;
  details: {
    intent_accuracy: number;
    response_quality: number;
    booking_success: boolean;
    function_calls: string[];
    errors: string[];
    execution_time: number;
  };
  agent_used: string;
  conversation_flow: Array<{
    message: string;
    response: string;
    intent?: IntentType;
    confidence?: number;
  }>;
}
interface TestReport {
  total_scenarios: number;
  passed: number;
  failed: number;
  average_score: number;
  domain_scores: Record<string, number>;
  performance_metrics: {
    avg_response_time: number;
    intent_accuracy: number;
    booking_success_rate: number;
    escalation_rate: number;
  };
  detailed_results: TestResult[];
  timestamp: Date;
}
export declare class AITestingService {
  private openai;
  private whatsappService;
  private intentRouter;
  private memoryService;
  private mediaProcessor;
  private agentFactory;
  constructor();
  private getTestScenarios;
  runTestScenario(scenario: TestScenario): Promise<TestResult>;
  private simulateAgentResponse;
  private evaluateResults;
  runAllTests(): Promise<TestReport>;
  private generateReport;
  testDomain(domain: BusinessDomain | "other"): Promise<TestResult[]>;
  quickHealthCheck(): Promise<{
    status: string;
    details: Record<string, any>;
  }>;
}
export {};
//# sourceMappingURL=ai-testing.service.d.ts.map
