
/**
 * Webhook Flow Orchestrator Service - REFATORADO
 * Versão simplificada que delega responsabilidades para sub-orquestradores
 * Mantém 100% de compatibilidade com interface existente
 */

import { OrchestratorCoreService } from './orchestrator/orchestrator-core.service';
import {
  OrchestratorInput,
  OrchestratorResult
} from '../types/orchestrator.types';

// Manter compatibilidade com interface legada existente
interface LegacyOrchestratorInput {
  messageText: string;
  userPhone: string;
  tenantId: string;
  isDemo?: boolean;
  whatsappNumber?: string;
}

export class WebhookFlowOrchestratorService {
  private coreOrchestrator: OrchestratorCoreService;

  constructor() {
    this.coreOrchestrator = new OrchestratorCoreService();
    console.log('🆕 WebhookFlowOrchestrator REFATORADO iniciado - versão modular');
  }

  /**
   * Método principal - mantém 100% compatibilidade com código existente
   * Delega processamento para OrchestratorCoreService
   */
  async orchestrateWebhookFlow(input: LegacyOrchestratorInput): Promise<OrchestratorResult> {
    // Converter formato legado para novo formato padronizado
    const standardInput: OrchestratorInput = {
      messageText: input.messageText,
      userPhone: input.userPhone,
      tenantId: input.tenantId,
      whatsappNumber: input.whatsappNumber,
      isDemo: input.isDemo || false,
      messageSource: input.isDemo ? 'whatsapp_demo' : 'whatsapp'
    };

    return await this.coreOrchestrator.orchestrateWebhookFlow(standardInput);
  }

  /**
   * Método alternativo para compatibilidade com chamadas que esperam formato específico
   */
  async processWebhookMessage(params: {
    messageText: string;
    userPhone: string;
    tenantId?: string;
    whatsappNumber?: string;
    
    isDemo?: boolean;
  }): Promise<OrchestratorResult> {
    return await this.orchestrateWebhookFlow({
      messageText: params.messageText,
      userPhone: params.userPhone,
      tenantId: params.tenantId || '',
      whatsappNumber: params.whatsappNumber,
      isDemo: params.isDemo
    });
  }
}