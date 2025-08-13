"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RulesEngineService = void 0;
class RulesEngineService {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = new Map();
        this.CACHE_TTL = 5 * 60 * 1000;
        console.log('🏗️ Rules Engine Service initialized');
        this.setupRulesPriority();
    }
    async validateBooking(bookingRequest, ruleSetId) {
        try {
            console.log(`🔍 Validating booking request for professional ${bookingRequest.professionalId}`);
            const violations = [];
            const warnings = [];
            const suggestions = [];
            const advanceResults = await this.validateAdvanceBookingRules(bookingRequest);
            violations.push(...advanceResults.violations);
            warnings.push(...advanceResults.warnings);
            const availabilityResults = await this.validateAvailabilityRules(bookingRequest);
            violations.push(...availabilityResults.violations);
            warnings.push(...availabilityResults.warnings);
            const durationResults = await this.validateDurationRules(bookingRequest);
            violations.push(...durationResults.violations);
            warnings.push(...durationResults.warnings);
            if (violations.length > 0) {
                const generatedSuggestions = await this.generateSuggestions(bookingRequest, violations);
                suggestions.push(...generatedSuggestions);
            }
            const isValid = violations.filter(v => v.severity === 'critical' || v.severity === 'high').length === 0;
            const result = {
                isValid,
                violations,
                warnings,
                suggestions,
                alternativeSlots: isValid ? undefined : await this.findAlternativeSlots(bookingRequest)
            };
            console.log(`✅ Validation complete. Valid: ${isValid}, Violations: ${violations.length}, Warnings: ${warnings.length}`);
            return result;
        }
        catch (error) {
            console.error('❌ Error validating booking:', error);
            throw new Error(`Rule validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async findAvailableSlots(criteria) {
        try {
            console.log(`🔍 Finding available slots for criteria:`, criteria);
            const cacheKey = `slots_${JSON.stringify(criteria)}`;
            const cached = this.getFromCache(cacheKey);
            if (cached)
                return cached;
            const availableSlots = [];
            const currentDate = new Date(criteria.dateRange.startDate);
            const endDate = new Date(criteria.dateRange.endDate);
            while (currentDate <= endDate) {
                const daySlots = await this.generateDaySlots(currentDate, criteria);
                availableSlots.push(...daySlots);
                currentDate.setDate(currentDate.getDate() + 1);
            }
            this.setCache(cacheKey, availableSlots);
            console.log(`✅ Found ${availableSlots.length} available slots`);
            return availableSlots;
        }
        catch (error) {
            console.error('❌ Error finding available slots:', error);
            throw new Error(`Slot finding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async validateAdvanceBookingRules(bookingRequest) {
        const violations = [];
        const warnings = [];
        const hoursUntilAppointment = this.getHoursUntilAppointment(bookingRequest.preferredDateTime);
        const minAdvanceHours = 2;
        if (hoursUntilAppointment < minAdvanceHours) {
            const hasException = bookingRequest.isEmergency || bookingRequest.clientType === 'vip';
            if (!hasException) {
                violations.push({
                    ruleId: 'advance-booking-rule',
                    ruleName: 'Minimum Advance Booking',
                    ruleType: 'advance_booking',
                    severity: 'critical',
                    message: `Minimum advance booking is ${minAdvanceHours} hours`,
                    affectedFields: ['preferredDateTime'],
                    suggestedFix: `Book at least ${minAdvanceHours} hours in advance`
                });
            }
            else {
                warnings.push({
                    ruleId: 'advance-booking-rule',
                    ruleName: 'Advance Booking Exception',
                    message: 'Exception applied for VIP/Emergency booking',
                    canProceed: true,
                    requiresConfirmation: true
                });
            }
        }
        return { violations, warnings };
    }
    async validateAvailabilityRules(bookingRequest) {
        const violations = [];
        const warnings = [];
        const requestDate = new Date(bookingRequest.preferredDateTime);
        const dayOfWeek = requestDate.getDay();
        const requestTime = this.getTimeString(requestDate);
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            violations.push({
                ruleId: 'availability-rule',
                ruleName: 'Working Days',
                ruleType: 'availability',
                severity: 'high',
                message: 'Professional is not available on weekends',
                affectedFields: ['preferredDateTime'],
                suggestedFix: 'Choose a weekday'
            });
        }
        const hour = requestDate.getHours();
        if (hour < 9 || hour >= 17) {
            violations.push({
                ruleId: 'availability-rule',
                ruleName: 'Working Hours',
                ruleType: 'availability',
                severity: 'high',
                message: 'Requested time is outside working hours (9 AM - 5 PM)',
                affectedFields: ['preferredDateTime'],
                suggestedFix: 'Choose a time between 9 AM and 5 PM'
            });
        }
        return { violations, warnings };
    }
    async validateDurationRules(bookingRequest) {
        const violations = [];
        const warnings = [];
        const requestedDuration = bookingRequest.duration || 60;
        const serviceDurations = {
            'haircut': { min: 30, max: 90, default: 45 },
            'hair-color': { min: 90, max: 240, default: 120 },
            'facial': { min: 45, max: 120, default: 60 },
            'manicure': { min: 20, max: 60, default: 30 }
        };
        const serviceLimits = serviceDurations[bookingRequest.serviceId];
        if (serviceLimits) {
            if (requestedDuration < serviceLimits.min) {
                violations.push({
                    ruleId: 'duration-rule',
                    ruleName: 'Minimum Duration',
                    ruleType: 'duration',
                    severity: 'medium',
                    message: `Minimum duration for ${bookingRequest.serviceId} is ${serviceLimits.min} minutes`,
                    affectedFields: ['duration'],
                    suggestedFix: `Increase duration to at least ${serviceLimits.min} minutes`
                });
            }
            if (requestedDuration > serviceLimits.max) {
                violations.push({
                    ruleId: 'duration-rule',
                    ruleName: 'Maximum Duration',
                    ruleType: 'duration',
                    severity: 'medium',
                    message: `Maximum duration for ${bookingRequest.serviceId} is ${serviceLimits.max} minutes`,
                    affectedFields: ['duration'],
                    suggestedFix: `Reduce duration to at most ${serviceLimits.max} minutes`
                });
            }
        }
        return { violations, warnings };
    }
    getHoursUntilAppointment(appointmentDate) {
        const now = new Date();
        const diffMs = appointmentDate.getTime() - now.getTime();
        return diffMs / (1000 * 60 * 60);
    }
    getTimeString(date) {
        return date.toTimeString().substring(0, 5);
    }
    async generateDaySlots(date, criteria) {
        const slots = [];
        for (let hour = 9; hour < 17; hour++) {
            for (let minute = 0; minute < 60; minute += 30) {
                const startTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                const endHour = minute === 30 ? hour + 1 : hour;
                const endMinute = minute === 30 ? 0 : minute + 30;
                const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
                slots.push({ start: startTime, end: endTime });
            }
        }
        return slots;
    }
    async generateSuggestions(bookingRequest, violations) {
        const suggestions = [];
        if (violations.some(v => v.affectedFields.includes('preferredDateTime'))) {
            suggestions.push({
                type: 'alternative_time',
                title: 'Alternative Times Available',
                description: 'We found other available times that might work for you',
                actionable: true,
                data: await this.findNearbyAvailableSlots(bookingRequest)
            });
        }
        for (const violation of violations) {
            if (violation.severity === 'critical' || violation.severity === 'high') {
                suggestions.push({
                    type: 'policy_explanation',
                    title: `About ${violation.ruleName}`,
                    description: violation.message,
                    actionable: false,
                    data: { suggestedFix: violation.suggestedFix }
                });
            }
        }
        return suggestions;
    }
    async findAlternativeSlots(bookingRequest) {
        const criteria = {
            professionalId: bookingRequest.professionalId,
            serviceId: bookingRequest.serviceId,
            dateRange: {
                startDate: new Date(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            },
            duration: bookingRequest.duration || 60
        };
        const availableSlots = await this.findAvailableSlots(criteria);
        return availableSlots.slice(0, 5);
    }
    async findNearbyAvailableSlots(bookingRequest) {
        const preferredDate = new Date(bookingRequest.preferredDateTime);
        const searchStart = new Date(preferredDate);
        searchStart.setDate(searchStart.getDate() - 1);
        const searchEnd = new Date(preferredDate);
        searchEnd.setDate(searchEnd.getDate() + 3);
        const criteria = {
            professionalId: bookingRequest.professionalId,
            serviceId: bookingRequest.serviceId,
            dateRange: {
                startDate: searchStart,
                endDate: searchEnd
            },
            duration: bookingRequest.duration || 60
        };
        const slots = await this.findAvailableSlots(criteria);
        return slots.slice(0, 3);
    }
    setupRulesPriority() {
        console.log('📋 Rules engine initialized with priority hierarchy');
    }
    getFromCache(key) {
        const expiry = this.cacheExpiry.get(key);
        if (expiry && Date.now() > expiry) {
            this.cache.delete(key);
            this.cacheExpiry.delete(key);
            return null;
        }
        return this.cache.get(key);
    }
    setCache(key, value) {
        this.cache.set(key, value);
        this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL);
    }
}
exports.RulesEngineService = RulesEngineService;
//# sourceMappingURL=rules-engine.service.js.map