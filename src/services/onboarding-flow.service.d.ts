export interface OnboardingStep {
  id: string;
  name: string;
  order: number;
  message: string;
  messageType: "text" | "interactive" | "template";
  buttons?: Array<{
    id: string;
    title: string;
  }>;
  expectedResponse?: "text" | "button" | "list";
  validationRules?: string[];
  nextStep?: string;
  skipCondition?: string;
}
export interface OnboardingFlow {
  tenantId: string;
  domain: string;
  steps: OnboardingStep[];
  welcomeMessage: string;
  completionMessage: string;
}
export interface UserOnboardingState {
  userId: string;
  tenantId: string;
  currentStep: string;
  stepData: Record<string, any>;
  isCompleted: boolean;
  startedAt: Date;
  completedAt?: Date;
}
export declare class OnboardingFlowService {
  private whatsappService;
  private emailService;
  constructor();
  startOnboarding(
    phone: string,
    tenantId: string,
    userName?: string,
  ): Promise<{
    success: boolean;
    message: string;
  }>;
  continueOnboarding(
    phone: string,
    tenantId: string,
    userResponse: string,
    responseType: "text" | "button" | "list",
  ): Promise<{
    success: boolean;
    isCompleted: boolean;
    message: string;
  }>;
  private getOnboardingFlow;
  private executeOnboardingStep;
  private validateResponse;
  private sendValidationError;
  private personalizeMessage;
  private createOnboardingState;
  private getOnboardingState;
  private updateOnboardingStep;
  private storeStepResponse;
  private getStepData;
  private completeOnboarding;
}
export declare const onboardingFlowService: OnboardingFlowService;
//# sourceMappingURL=onboarding-flow.service.d.ts.map
