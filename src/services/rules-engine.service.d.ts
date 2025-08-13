import {
  TimeSlot,
  RuleValidationResult,
  BookingRequest,
  AvailabilityCriteria,
} from "../types/rules.types";
export declare class RulesEngineService {
  private cache;
  private cacheExpiry;
  private readonly CACHE_TTL;
  constructor();
  validateBooking(
    bookingRequest: BookingRequest,
    ruleSetId: string,
  ): Promise<RuleValidationResult>;
  findAvailableSlots(criteria: AvailabilityCriteria): Promise<TimeSlot[]>;
  private validateAdvanceBookingRules;
  private validateAvailabilityRules;
  private validateDurationRules;
  private getHoursUntilAppointment;
  private getTimeString;
  private generateDaySlots;
  private generateSuggestions;
  private findAlternativeSlots;
  private findNearbyAvailableSlots;
  private setupRulesPriority;
  private getFromCache;
  private setCache;
}
//# sourceMappingURL=rules-engine.service.d.ts.map
