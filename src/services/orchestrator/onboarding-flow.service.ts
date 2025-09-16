/**
 * Deterministic onboarding flow service
 * Handles the 3-step onboarding process: Name → Email → Gender
 */

import {
    DataCollectionState,
    OnboardingFlowResult,
    UserDataExtractionResult,
    OrchestratorContext
} from '../../types';
import {
    extractUserData,
    determineNextCollectionState,
    firstName
} from './user-data-extraction.utils';
import {
    contextAwareService,
    ConversationContext,
    ContextualResponse
} from '../conversation-intelligence/context-aware.service';

export class OnboardingFlowService {

    /**
     * Process onboarding flow for a user
     */
    async processOnboardingFlow(
        ctx: OrchestratorContext,
        currentState: DataCollectionState,
        userData: {
            name?: string;
            email?: string;
            gender?: string;
        }
    ): Promise<OnboardingFlowResult> {

        // Build conversation context for intelligent responses
        const conversationContext: ConversationContext = {
            hasName: !!userData.name,
            hasEmail: !!userData.email,
            userName: userData.name,
            userEmail: userData.email,
            currentStage: 'onboarding',
            previousMessages: [], // TODO: Get from conversation history
            tenantName: ctx.tenantConfig?.business_name || ctx.tenantConfig?.name || 'nosso negócio',
            businessType: ctx.tenantConfig?.business_type || ctx.tenantConfig?.domain || 'serviço'
        };

        // Check if this message needs contextual intelligence first
        const contextualResponse = await contextAwareService.processContextualMessage(
            ctx.message,
            conversationContext
        );

        // If context-aware service handles this completely, use its response
        if (!contextualResponse.shouldContinueFlow) {
            return {
                success: true,
                shouldContinue: false,
                response: contextualResponse.message,
                isComplete: contextualResponse.nextStage === 'service_selection',
                nextState: contextualResponse.nextStage === 'service_selection'
                    ? DataCollectionState.COMPLETED
                    : DataCollectionState.AWAITING_NAME,
                extractedData: contextualResponse.contextUpdate ? {
                    name: contextualResponse.contextUpdate.userName || userData.name,
                    email: contextualResponse.contextUpdate.userEmail || userData.email,
                    gender: userData.gender,
                    extractedSuccessfully: true
                } : undefined,
                aiMetrics: contextualResponse.aiMetrics
            };
        }

        // Extract any data from the current message
        const extractedData = extractUserData(ctx.message);

        // Merge existing data with newly extracted data
        const updatedData = {
            name: extractedData.name || userData.name,
            email: extractedData.email || userData.email,
            gender: extractedData.gender || userData.gender
        };

        // Determine what we still need
        const hasName = !!updatedData.name;
        const hasEmail = !!updatedData.email;
        const hasGender = !!updatedData.gender;

        // Check if onboarding is complete
        if (hasName && hasEmail && hasGender) {
            const name = firstName(updatedData.name);
            return {
                success: true,
                shouldContinue: false,
                response: `Perfeito, ${name}! Seus dados foram salvos. Como posso te ajudar hoje?`,
                isComplete: true,
                nextState: DataCollectionState.COMPLETED,
                extractedData: {
                    name: updatedData.name,
                    email: updatedData.email,
                    gender: updatedData.gender,
                    extractedSuccessfully: true
                }
            };
        }

        // Determine next state and generate appropriate response
        const nextState = determineNextCollectionState(
            currentState,
            hasName,
            hasEmail,
            hasGender
        );

        let response: string;

        // Update conversation context with new data
        const updatedConversationContext: ConversationContext = {
            ...conversationContext,
            hasName: hasName,
            hasEmail: hasEmail,
            userName: updatedData.name,
            userEmail: updatedData.email
        };

        // Use contextual response when transitioning between states
        let capturedAiMetrics: any = undefined;

        if (extractedData.name || extractedData.email || extractedData.gender) {
            // Data was extracted, get intelligent transition response
            const transitionResponse = await contextAwareService.processContextualMessage(
                ctx.message,
                updatedConversationContext
            );

            // Capture AI metrics from transition response
            if (transitionResponse.aiMetrics) {
                capturedAiMetrics = transitionResponse.aiMetrics;
            }

            if (transitionResponse.shouldContinueFlow && transitionResponse.message) {
                response = transitionResponse.message;
            } else {
                // Fallback to original logic
                response = this.getDefaultStateResponse(nextState, extractedData, updatedData);
            }
        } else {
            // No data extracted, use default prompting
            response = this.getDefaultStateResponse(nextState, extractedData, updatedData);
        }

        const isCompleted = nextState === DataCollectionState.COMPLETED;

        return {
            success: true,
            shouldContinue: !isCompleted,
            response,
            nextState,
            isComplete: isCompleted,
            extractedData: extractedData.extractedSuccessfully ? {
                name: updatedData.name,
                email: updatedData.email,
                gender: updatedData.gender,
                extractedSuccessfully: true
            } : undefined,
            aiMetrics: capturedAiMetrics
        };
    }

    /**
     * Check if user needs onboarding
     */
    needsOnboarding(userData: { name?: string; email?: string; gender?: string }): boolean {
        return !userData.name || !userData.email || !userData.gender;
    }

    /**
     * Get current onboarding state based on available data
     */
    getCurrentOnboardingState(userData: { name?: string; email?: string; gender?: string }): DataCollectionState {
        if (userData.name && userData.email && userData.gender) {
            return DataCollectionState.COMPLETED;
        }

        return determineNextCollectionState(
            DataCollectionState.IDLE,
            !!userData.name,
            !!userData.email,
            !!userData.gender
        );
    }

    /**
     * Get default response for onboarding state (fallback method)
     */
    private getDefaultStateResponse(
        nextState: DataCollectionState,
        extractedData: UserDataExtractionResult,
        updatedData: { name?: string; email?: string; gender?: string }
    ): string {
        switch (nextState) {
            case DataCollectionState.AWAITING_NAME:
                if (extractedData.name) {
                    // Name was just extracted, move to email
                    return `Prazer em te conhecer, ${firstName(extractedData.name)}! Agora preciso do seu e-mail para finalizar o cadastro.`;
                } else {
                    // Still need name
                    return `Olá! Para começar, preciso do seu nome completo. Pode me dizer qual é o seu nome?`;
                }

            case DataCollectionState.AWAITING_EMAIL:
                if (extractedData.email) {
                    // Email was just extracted, move to gender
                    const name = firstName(updatedData.name);
                    return `Ótimo, ${name}! E-mail ${extractedData.email} salvo. Por último, você é homem ou mulher? (Para personalizar melhor o atendimento)`;
                } else {
                    // Still need email
                    const name = firstName(updatedData.name);
                    return `Obrigado, ${name}! Agora preciso do seu e-mail para finalizar o cadastro.`;
                }

            case DataCollectionState.AWAITING_GENDER:
                if (extractedData.gender) {
                    // Gender was inferred or extracted, complete onboarding
                    const name = firstName(updatedData.name);
                    return `Perfeito, ${name}! Seus dados foram salvos. Como posso te ajudar hoje?`;
                } else {
                    // Still need gender
                    const name = firstName(updatedData.name);
                    return `Quase pronto, ${name}! Por último, você é homem ou mulher? (Para personalizar melhor o atendimento)`;
                }

            default:
                return `Vamos começar o seu cadastro. Qual é o seu nome completo?`;
        }
    }

    /**
     * Generate greeting for completed onboarding
     */
    generateCompletedGreeting(userName: string): string {
        const name = firstName(userName);
        const greetings = [
            `Olá, ${name}! Como posso te ajudar hoje?`,
            `Oi, ${name}! Em que posso te auxiliar?`,
            `Bom dia, ${name}! Como posso te atender?`
        ];

        const hour = new Date().getHours();
        if (hour >= 6 && hour < 12) {
            return `Bom dia, ${name}! Como posso te ajudar hoje?`;
        } else if (hour >= 12 && hour < 18) {
            return `Boa tarde, ${name}! Como posso te ajudar hoje?`;
        } else {
            return `Boa noite, ${name}! Como posso te ajudar hoje?`;
        }
    }
}