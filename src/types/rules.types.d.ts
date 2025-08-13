export interface TimeSlot {
  start: string;
  end: string;
}
export interface DateRange {
  startDate: Date;
  endDate: Date;
}
export interface RecurrencePattern {
  type: "daily" | "weekly" | "monthly" | "yearly" | "custom";
  interval: number;
  daysOfWeek?: number[];
  daysOfMonth?: number[];
  weeksOfMonth?: number[];
  customPattern?: string;
}
export interface CancellationRule {
  id: string;
  name: string;
  description: string;
  freeWindow: {
    amount: number;
    unit: "minutes" | "hours" | "days";
  };
  penalties: CancellationPenalty[];
  noShowPenalty?: CancellationPenalty;
  emergencyExceptions?: boolean;
  clientTierExceptions?: string[];
  refundPolicy: {
    withinFreeWindow: number;
    afterFreeWindow: number;
    noShow: number;
    emergencyRefund: number;
  };
}
export interface CancellationPenalty {
  timeFrame: {
    start: number;
    end: number;
  };
  penalty: {
    type: "percentage" | "fixed" | "noRefund";
    amount?: number;
  };
  description: string;
}
export interface AdvanceBookingRule {
  id: string;
  name: string;
  minimumAdvance: {
    amount: number;
    unit: "minutes" | "hours" | "days";
    exceptions?: AdvanceBookingException[];
  };
  maximumAdvance: {
    amount: number;
    unit: "days" | "weeks" | "months";
    exceptions?: AdvanceBookingException[];
  };
  sameDayBooking: {
    allowed: boolean;
    cutoffTime?: string;
    emergencySlots?: boolean;
  };
  serviceOverrides?: {
    serviceId: string;
    minimumAdvance?: {
      amount: number;
      unit: "minutes" | "hours" | "days";
    };
    maximumAdvance?: {
      amount: number;
      unit: "days" | "weeks" | "months";
    };
  }[];
}
export interface AdvanceBookingException {
  condition: "vip_client" | "emergency" | "staff_booking" | "custom";
  customCondition?: string;
  overrideMinimum?: {
    amount: number;
    unit: "minutes" | "hours" | "days";
  };
  overrideMaximum?: {
    amount: number;
    unit: "days" | "weeks" | "months";
  };
}
export interface AvailabilityRule {
  id: string;
  name: string;
  professionalId: string;
  regularHours: WeeklySchedule;
  seasonalPatterns?: SeasonalPattern[];
  irregularSchedules?: IrregularSchedule[];
  daysOff: DayOffRule[];
  overrides: AvailabilityOverride[];
}
export interface WeeklySchedule {
  monday?: DaySchedule;
  tuesday?: DaySchedule;
  wednesday?: DaySchedule;
  thursday?: DaySchedule;
  friday?: DaySchedule;
  saturday?: DaySchedule;
  sunday?: DaySchedule;
}
export interface DaySchedule {
  workingHours: TimeSlot[];
  breaks: TimeSlot[];
  isWorkingDay: boolean;
  notes?: string;
}
export interface SeasonalPattern {
  name: string;
  period: DateRange;
  schedule: WeeklySchedule;
  recurrence?: RecurrencePattern;
}
export interface IrregularSchedule {
  name: string;
  pattern: "alternating_weeks" | "rotating_shifts" | "custom";
  schedules: {
    week1?: WeeklySchedule;
    week2?: WeeklySchedule;
    week3?: WeeklySchedule;
    week4?: WeeklySchedule;
  };
  customRotation?: WeeklySchedule[];
}
export interface DayOffRule {
  id: string;
  type: "single_day" | "recurring" | "date_range";
  date?: Date;
  dateRange?: DateRange;
  recurrence?: RecurrencePattern;
  reason: string;
  isPaid?: boolean;
}
export interface AvailabilityOverride {
  id: string;
  date: Date;
  schedule?: DaySchedule;
  isUnavailable?: boolean;
  reason: string;
  priority: number;
}
export interface RuleValidationResult {
  isValid: boolean;
  violations: RuleViolation[];
  warnings: RuleWarning[];
  suggestions: RuleSuggestion[];
  alternativeSlots?: TimeSlot[] | undefined;
}
export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  ruleType: string;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  affectedFields: string[];
  suggestedFix?: string;
}
export interface RuleWarning {
  ruleId: string;
  ruleName: string;
  message: string;
  canProceed: boolean;
  requiresConfirmation: boolean;
}
export interface RuleSuggestion {
  type:
    | "alternative_time"
    | "alternative_service"
    | "alternative_professional"
    | "policy_explanation";
  title: string;
  description: string;
  actionable: boolean;
  data?: any;
}
export interface BookingRequest {
  professionalId: string;
  serviceId: string;
  clientId: string;
  preferredDateTime: Date;
  duration?: number;
  notes?: string;
  clientType?: string;
  isEmergency?: boolean;
}
export interface AvailabilityCriteria {
  professionalId?: string;
  serviceId?: string;
  dateRange: DateRange;
  duration: number;
  clientType?: string;
  preferences?: {
    timeOfDay?: "morning" | "afternoon" | "evening";
    daysOfWeek?: number[];
    urgency?: "low" | "medium" | "high" | "emergency";
  };
}
//# sourceMappingURL=rules.types.d.ts.map
