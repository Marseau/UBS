/**
 * Deterministic onboarding flow service
 * Handles the 3-step onboarding process: Name → Email → Gender
 */

import {
    DataCollectionState,
    OnboardingFlowResult,
    UserDataExtractionResult,
    OrchestratorContext
} from './orchestrator.types';
import {
    extractUserData,
    determineNextCollectionState,
    firstName
} from './user-data-extraction.utils';

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
                shouldContinue: false,
                response: `Perfeito, ${name}! Seus dados foram salvos. Como posso te ajudar hoje?`,
                isCompleted: true,
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

        switch (nextState) {
            case DataCollectionState.AWAITING_NAME:
                if (extractedData.name) {
                    // Name was just extracted, move to email
                    response = `Prazer em te conhecer, ${firstName(extractedData.name)}! Agora preciso do seu e-mail para finalizar o cadastro.`;
                } else {
                    // Still need name
                    response = `Olá! Para começar, preciso do seu nome completo. Pode me dizer qual é o seu nome?`;
                }
                break;

            case DataCollectionState.AWAITING_EMAIL:
                if (extractedData.email) {
                    // Email was just extracted, move to gender
                    const name = firstName(updatedData.name);
                    response = `Ótimo, ${name}! E-mail ${extractedData.email} salvo. Por último, você é homem ou mulher? (Para personalizar melhor o atendimento)`;
                } else {
                    // Still need email
                    const name = firstName(updatedData.name);
                    response = `Obrigado, ${name}! Agora preciso do seu e-mail para finalizar o cadastro.`;
                }
                break;

            case DataCollectionState.AWAITING_GENDER:
                if (extractedData.gender) {
                    // Gender was inferred or extracted, complete onboarding
                    const name = firstName(updatedData.name);
                    response = `Perfeito, ${name}! Seus dados foram salvos. Como posso te ajudar hoje?`;
                } else {
                    // Still need gender
                    const name = firstName(updatedData.name);
                    response = `Quase pronto, ${name}! Por último, você é homem ou mulher? (Para personalizar melhor o atendimento)`;
                }
                break;

            default:
                response = `Vamos começar o seu cadastro. Qual é o seu nome completo?`;
                break;
        }

        const isCompleted = nextState === DataCollectionState.COMPLETED;

        return {
            shouldContinue: !isCompleted,
            response,
            nextState,
            isCompleted,
            extractedData: extractedData.extractedSuccessfully ? {
                name: updatedData.name,
                email: updatedData.email,
                gender: updatedData.gender,
                extractedSuccessfully: true
            } : undefined
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