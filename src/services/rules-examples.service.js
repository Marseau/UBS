"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RulesExamplesService = void 0;
class RulesExamplesService {
    getBeautySalonExamples() {
        return {
            cancellationPolicy: {
                id: 'beauty-salon-cancellation',
                name: 'Flexible Cancellation Policy',
                description: 'Client-friendly cancellation with graduated penalties',
                freeWindow: { amount: 24, unit: 'hours' },
                penalties: [
                    {
                        timeFrame: { start: 24, end: 4 },
                        penalty: { type: 'percentage', amount: 25 },
                        description: '25% fee for cancellations 4-24 hours before'
                    },
                    {
                        timeFrame: { start: 4, end: 0 },
                        penalty: { type: 'percentage', amount: 50 },
                        description: '50% fee for cancellations less than 4 hours before'
                    }
                ],
                emergencyExceptions: true,
                clientTierExceptions: ['vip', 'premium'],
                refundPolicy: {
                    withinFreeWindow: 100,
                    afterFreeWindow: 75,
                    noShow: 0,
                    emergencyRefund: 100
                }
            },
            advanceBooking: {
                id: 'beauty-salon-advance',
                name: 'Standard Advance Booking',
                minimumAdvance: { amount: 2, unit: 'hours' },
                maximumAdvance: { amount: 90, unit: 'days' },
                sameDayBooking: {
                    allowed: true,
                    cutoffTime: '16:00',
                    emergencySlots: true
                },
                serviceOverrides: [
                    {
                        serviceId: 'hair-color',
                        minimumAdvance: { amount: 48, unit: 'hours' }
                    },
                    {
                        serviceId: 'wedding-package',
                        minimumAdvance: { amount: 7, unit: 'days' }
                    }
                ]
            },
            availability: {
                professionalId: 'stylist-001',
                regularHours: {
                    tuesday: {
                        workingHours: [{ start: '09:00', end: '17:00' }],
                        breaks: [{ start: '12:00', end: '13:00' }],
                        isWorkingDay: true
                    },
                    wednesday: {
                        workingHours: [{ start: '09:00', end: '17:00' }],
                        breaks: [{ start: '12:00', end: '13:00' }],
                        isWorkingDay: true
                    },
                    thursday: {
                        workingHours: [{ start: '09:00', end: '20:00' }],
                        breaks: [{ start: '12:00', end: '13:00' }, { start: '17:00', end: '17:30' }],
                        isWorkingDay: true,
                        notes: 'Extended hours'
                    },
                    friday: {
                        workingHours: [{ start: '09:00', end: '20:00' }],
                        breaks: [{ start: '12:00', end: '13:00' }],
                        isWorkingDay: true
                    },
                    saturday: {
                        workingHours: [{ start: '08:00', end: '18:00' }],
                        breaks: [{ start: '12:00', end: '12:30' }],
                        isWorkingDay: true,
                        notes: 'Busy day - shorter breaks'
                    }
                },
                seasonalPatterns: [
                    {
                        name: 'Holiday Season',
                        period: {
                            startDate: new Date('2024-12-01'),
                            endDate: new Date('2024-12-31')
                        },
                        schedule: {
                            monday: {
                                workingHours: [{ start: '09:00', end: '17:00' }],
                                breaks: [{ start: '12:00', end: '12:30' }],
                                isWorkingDay: true,
                                notes: 'Holiday season - Mondays open'
                            }
                        }
                    }
                ]
            },
            serviceDurations: [
                {
                    serviceId: 'haircut',
                    serviceName: 'Basic Haircut',
                    defaultDuration: 45,
                    minimumDuration: 30,
                    maximumDuration: 60,
                    allowCustomDuration: true,
                    incrementSize: 15
                },
                {
                    serviceId: 'hair-color',
                    serviceName: 'Hair Coloring',
                    defaultDuration: 120,
                    minimumDuration: 90,
                    maximumDuration: 180,
                    allowCustomDuration: true,
                    incrementSize: 30
                },
                {
                    serviceId: 'facial',
                    serviceName: 'Deep Cleansing Facial',
                    defaultDuration: 60,
                    minimumDuration: 45,
                    maximumDuration: 90,
                    allowCustomDuration: true,
                    incrementSize: 15
                }
            ],
            bufferTimes: {
                beforeAppointment: { duration: 5, purpose: 'preparation', required: true },
                afterAppointment: { duration: 10, purpose: 'cleanup', required: true },
                serviceSpecific: [
                    {
                        serviceId: 'hair-color',
                        beforeBuffer: 15,
                        afterBuffer: 20,
                        reason: 'Color processing requires extra setup and cleanup'
                    }
                ]
            },
            specialRules: [
                {
                    id: 'vip-priority',
                    name: 'VIP Client Priority',
                    type: 'vip',
                    priority: 8,
                    applicability: { clientTypes: ['vip', 'premium'] },
                    effect: {
                        type: 'allow_booking',
                        notification: {
                            recipients: ['manager@salon.com'],
                            message: 'VIP client booking made',
                            urgent: false
                        }
                    }
                },
                {
                    id: 'holiday-hours',
                    name: 'Holiday Operating Hours',
                    type: 'holiday',
                    priority: 9,
                    applicability: {
                        dateRanges: [{ startDate: new Date('2024-12-24'), endDate: new Date('2024-12-24') }]
                    },
                    effect: {
                        type: 'modify_availability',
                        availabilityModification: {
                            extendHours: [{ start: '09:00', end: '15:00' }]
                        }
                    }
                }
            ]
        };
    }
    getMedicalClinicExamples() {
        return {
            cancellationPolicy: {
                id: 'medical-clinic-cancellation',
                name: 'Medical Appointment Cancellation Policy',
                description: 'Strict cancellation policy for medical appointments',
                freeWindow: { amount: 48, unit: 'hours' },
                penalties: [
                    {
                        timeFrame: { start: 48, end: 24 },
                        penalty: { type: 'fixed', amount: 25 },
                        description: '$25 fee for cancellations 24-48 hours before'
                    },
                    {
                        timeFrame: { start: 24, end: 0 },
                        penalty: { type: 'percentage', amount: 75 },
                        description: '75% of appointment fee for cancellations less than 24 hours'
                    }
                ],
                emergencyExceptions: true,
                clientTierExceptions: [],
                refundPolicy: {
                    withinFreeWindow: 100,
                    afterFreeWindow: 25,
                    noShow: 0,
                    emergencyRefund: 100
                }
            },
            advanceBooking: {
                id: 'medical-clinic-advance',
                name: 'Medical Appointment Advance Booking',
                minimumAdvance: { amount: 24, unit: 'hours' },
                maximumAdvance: { amount: 6, unit: 'months' },
                sameDayBooking: { allowed: false, emergencySlots: true },
                serviceOverrides: [
                    {
                        serviceId: 'surgery-consultation',
                        minimumAdvance: { amount: 7, unit: 'days' }
                    }
                ]
            },
            availability: {
                professionalId: 'doctor-001',
                regularHours: {
                    monday: {
                        workingHours: [{ start: '08:00', end: '17:00' }],
                        breaks: [{ start: '12:00', end: '13:00' }],
                        isWorkingDay: true
                    },
                    tuesday: {
                        workingHours: [{ start: '08:00', end: '17:00' }],
                        breaks: [{ start: '12:00', end: '13:00' }],
                        isWorkingDay: true
                    },
                    wednesday: {
                        workingHours: [{ start: '08:00', end: '12:00' }],
                        breaks: [],
                        isWorkingDay: true,
                        notes: 'Morning clinic only'
                    },
                    thursday: {
                        workingHours: [{ start: '08:00', end: '17:00' }],
                        breaks: [{ start: '12:00', end: '13:00' }],
                        isWorkingDay: true
                    },
                    friday: {
                        workingHours: [{ start: '08:00', end: '15:00' }],
                        breaks: [{ start: '12:00', end: '12:30' }],
                        isWorkingDay: true
                    }
                }
            },
            serviceDurations: [
                {
                    serviceId: 'consultation',
                    serviceName: 'General Consultation',
                    defaultDuration: 30,
                    minimumDuration: 20,
                    maximumDuration: 45,
                    allowCustomDuration: true,
                    incrementSize: 5
                },
                {
                    serviceId: 'annual-checkup',
                    serviceName: 'Annual Physical Exam',
                    defaultDuration: 60,
                    minimumDuration: 45,
                    maximumDuration: 90,
                    allowCustomDuration: true,
                    incrementSize: 15
                }
            ],
            bufferTimes: {
                beforeAppointment: { duration: 5, purpose: 'preparation', required: true },
                afterAppointment: { duration: 10, purpose: 'notes', required: true },
                serviceSpecific: [
                    {
                        serviceId: 'annual-checkup',
                        beforeBuffer: 10,
                        afterBuffer: 15,
                        reason: 'Comprehensive exam requires extra time'
                    }
                ]
            },
            specialRules: [
                {
                    id: 'emergency-slots',
                    name: 'Emergency Appointment Slots',
                    type: 'emergency',
                    priority: 10,
                    applicability: {
                        timeSlots: [
                            { start: '08:00', end: '08:30' },
                            { start: '13:00', end: '13:30' }
                        ]
                    },
                    effect: {
                        type: 'allow_booking',
                        approvalRequirement: {
                            level: 'system_admin',
                            reason: 'Emergency slot access'
                        }
                    }
                }
            ]
        };
    }
    getFitnessStudioExamples() {
        return {
            cancellationPolicy: {
                id: 'fitness-studio-cancellation',
                name: 'Fitness Class Cancellation Policy',
                description: 'Fair cancellation policy for fitness classes',
                freeWindow: { amount: 12, unit: 'hours' },
                penalties: [
                    {
                        timeFrame: { start: 12, end: 2 },
                        penalty: { type: 'fixed', amount: 10 },
                        description: '$10 late cancellation fee'
                    },
                    {
                        timeFrame: { start: 2, end: 0 },
                        penalty: { type: 'percentage', amount: 100 },
                        description: 'Full class fee for cancellations less than 2 hours before'
                    }
                ],
                emergencyExceptions: true,
                refundPolicy: {
                    withinFreeWindow: 100,
                    afterFreeWindow: 0,
                    noShow: 0,
                    emergencyRefund: 50
                }
            },
            advanceBooking: {
                id: 'fitness-studio-advance',
                name: 'Fitness Class Booking',
                minimumAdvance: { amount: 30, unit: 'minutes' },
                maximumAdvance: { amount: 14, unit: 'days' },
                sameDayBooking: { allowed: true, cutoffTime: '23:59' }
            },
            availability: {
                professionalId: 'instructor-001',
                regularHours: {
                    monday: {
                        workingHours: [
                            { start: '06:00', end: '10:00' },
                            { start: '17:00', end: '21:00' }
                        ],
                        breaks: [],
                        isWorkingDay: true,
                        notes: 'Morning and evening classes'
                    },
                    wednesday: {
                        workingHours: [
                            { start: '06:00', end: '10:00' },
                            { start: '17:00', end: '21:00' }
                        ],
                        breaks: [],
                        isWorkingDay: true
                    },
                    friday: {
                        workingHours: [
                            { start: '06:00', end: '10:00' },
                            { start: '17:00', end: '21:00' }
                        ],
                        breaks: [],
                        isWorkingDay: true
                    },
                    saturday: {
                        workingHours: [{ start: '08:00', end: '16:00' }],
                        breaks: [{ start: '12:00', end: '13:00' }],
                        isWorkingDay: true,
                        notes: 'Weekend intensive classes'
                    }
                }
            },
            serviceDurations: [
                {
                    serviceId: 'yoga-class',
                    serviceName: 'Yoga Class',
                    defaultDuration: 60,
                    minimumDuration: 60,
                    maximumDuration: 60,
                    allowCustomDuration: false,
                    incrementSize: 60
                },
                {
                    serviceId: 'personal-training',
                    serviceName: 'Personal Training Session',
                    defaultDuration: 60,
                    minimumDuration: 30,
                    maximumDuration: 90,
                    allowCustomDuration: true,
                    incrementSize: 30
                }
            ]
        };
    }
    getRuleTemplate(ruleType) {
        switch (ruleType) {
            case 'cancellation':
                return this.getCancellationRuleTemplate();
            case 'advance_booking':
                return this.getAdvanceBookingRuleTemplate();
            case 'availability':
                return this.getAvailabilityRuleTemplate();
            case 'duration':
                return this.getDurationRuleTemplate();
            case 'buffer_time':
                return this.getBufferTimeRuleTemplate();
            case 'special':
                return this.getSpecialRuleTemplate();
            default:
                throw new Error(`Unknown rule type: ${ruleType}`);
        }
    }
    getCancellationRuleTemplate() {
        return {
            id: '',
            name: '',
            description: '',
            freeWindow: { amount: 24, unit: 'hours' },
            penalties: [],
            emergencyExceptions: true,
            clientTierExceptions: ['vip'],
            refundPolicy: {
                withinFreeWindow: 100,
                afterFreeWindow: 50,
                noShow: 0,
                emergencyRefund: 100
            }
        };
    }
    getAdvanceBookingRuleTemplate() {
        return {
            id: '',
            name: '',
            minimumAdvance: { amount: 2, unit: 'hours' },
            maximumAdvance: { amount: 90, unit: 'days' },
            sameDayBooking: { allowed: true, emergencySlots: true }
        };
    }
    getAvailabilityRuleTemplate() {
        return {
            id: '',
            name: '',
            professionalId: '',
            regularHours: {},
            daysOff: [],
            overrides: []
        };
    }
    getDurationRuleTemplate() {
        return {
            id: '',
            name: '',
            serviceDurations: [],
            includeBufferInDuration: false
        };
    }
    getBufferTimeRuleTemplate() {
        return {
            id: '',
            name: '',
            beforeAppointment: { duration: 5, purpose: 'preparation', required: true },
            afterAppointment: { duration: 10, purpose: 'cleanup', required: true }
        };
    }
    getSpecialRuleTemplate() {
        return {
            id: '',
            name: '',
            type: 'custom',
            priority: 5,
            applicability: {},
            effect: { type: 'require_approval' },
            conditions: [],
            canOverride: true,
            overrideRequiresApproval: true
        };
    }
    getAllIndustryExamples() {
        return {
            beautySalon: this.getBeautySalonExamples(),
            medicalClinic: this.getMedicalClinicExamples(),
            fitnessStudio: this.getFitnessStudioExamples()
        };
    }
    getRecommendedRules(businessType) {
        const recommendations = {
            'beauty_salon': {
                cancellationWindow: '24 hours',
                minimumAdvance: '2 hours',
                bufferTime: 'Service-specific (5-20 minutes)',
                specialFeatures: ['VIP exceptions', 'Seasonal hours', 'Service-specific rules']
            },
            'medical_clinic': {
                cancellationWindow: '48 hours',
                minimumAdvance: '24 hours',
                bufferTime: 'Standard (5-15 minutes)',
                specialFeatures: ['Emergency slots', 'Strict policies', 'Professional constraints']
            },
            'fitness_studio': {
                cancellationWindow: '12 hours',
                minimumAdvance: '30 minutes',
                bufferTime: 'Minimal (0-5 minutes)',
                specialFeatures: ['Class-based scheduling', 'Membership tiers', 'Peak hour management']
            },
            'restaurant': {
                cancellationWindow: '2 hours',
                minimumAdvance: '30 minutes',
                bufferTime: 'Table turnover time',
                specialFeatures: ['Party size rules', 'Peak hour premiums', 'Special event blocking']
            }
        };
        return recommendations[businessType] || recommendations['beauty_salon'];
    }
}
exports.RulesExamplesService = RulesExamplesService;
//# sourceMappingURL=rules-examples.service.js.map