/**
 * Flow State Types - State management for conversation flows
 */

import { FlowType, FlowStep } from './flow-lock.types';

export interface FlowState {
  flow: FlowType;
  step: FlowStep;
  data: Record<string, any>;
  started_at: string;
  updated_at: string;
}

export interface FlowTransition {
  from_flow: FlowType;
  from_step: FlowStep;
  to_flow: FlowType;
  to_step: FlowStep;
  triggered_by: string;
  timestamp: string;
}

export interface AppointmentFlowState {
  flow: FlowType;
  step: FlowStep;
  appointment_id?: string;
  service_name?: string;
  professional_name?: string;
  datetime?: string;
  status?: string;
  data: Record<string, any>;
  started_at: string;
  updated_at: string;
}
