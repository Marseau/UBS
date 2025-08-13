export interface PhoneValidationResult {
  isValid: boolean;
  hasWhatsApp: boolean;
  formattedPhone: string;
  country?: string;
  carrier?: string;
  errors?: string[];
}
export interface UserRegistrationResult {
  success: boolean;
  userId?: string;
  isNewUser: boolean;
  needsOnboarding: boolean;
  message: string;
}
export declare class PhoneValidationService {
  validatePhoneNumber(phone: string): Promise<PhoneValidationResult>;
  private validatePhoneFormat;
  private checkWhatsAppAvailability;
  registerUserByPhone(
    phone: string,
    tenantId: string,
    name?: string,
    additionalData?: Record<string, any>,
  ): Promise<UserRegistrationResult>;
  markUserAsOnboarded(userId: string, tenantId: string): Promise<boolean>;
  getUserOnboardingStatus(
    phone: string,
    tenantId: string,
  ): Promise<{
    exists: boolean;
    needsOnboarding: boolean;
    userId?: string;
  }>;
  sendVerificationCode(phone: string): Promise<{
    success: boolean;
    code?: string;
    message: string;
  }>;
  verifyPhoneWithCode(phone: string, code: string): Promise<boolean>;
}
export declare const phoneValidationService: PhoneValidationService;
//# sourceMappingURL=phone-validation.service.d.ts.map
