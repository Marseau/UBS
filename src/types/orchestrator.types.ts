/**
 * Orchestrator Types - Types for agent orchestration and data collection
 */

export interface DataCollectionState {
  current_field?: string;
  collected_fields?: string[];
  missing_fields?: string[];
  validation_errors?: Record<string, string>;
  retry_count?: number;
  started_at?: string;
  last_updated_at?: string;
  is_complete?: boolean;
  [key: string]: any;
}

export interface OrchestratorContext {
  tenant_id: string;
  session_id: string;
  user_id: string;
  current_agent?: string;
  agent_history?: string[];
  orchestration_started_at?: string;
  last_agent_switch_at?: string;
}

export interface AgentTransition {
  from_agent: string | null;
  to_agent: string;
  reason: string;
  timestamp: string;
  context_preserved: boolean;
}
