"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateServiceDuration = validateServiceDuration;
exports.validateServicePrice = validateServicePrice;
exports.validateAppointmentStatus = validateAppointmentStatus;
exports.getServiceConfigProperty = getServiceConfigProperty;
exports.validateString = validateString;
exports.validateArray = validateArray;
exports.validateDate = validateDate;
exports.calculateEndTime = calculateEndTime;
function validateServiceDuration(durationMinutes) {
    if (!durationMinutes || durationMinutes <= 0) {
        return 60;
    }
    return durationMinutes;
}
function validateServicePrice(basePrice) {
    if (!basePrice || basePrice <= 0) {
        return 100;
    }
    return basePrice;
}
function validateAppointmentStatus(status) {
    const validStatuses = [
        "pending", "confirmed", "in_progress", "completed",
        "cancelled", "no_show", "rescheduled"
    ];
    if (validStatuses.includes(status)) {
        return status;
    }
    return "pending";
}
function getServiceConfigProperty(serviceConfig, property) {
    if (!serviceConfig || typeof serviceConfig !== 'object') {
        return undefined;
    }
    return serviceConfig[property];
}
function validateString(value, defaultValue = '') {
    return value || defaultValue;
}
function validateArray(value, defaultValue = []) {
    return value || defaultValue;
}
function validateDate(dateString) {
    if (!dateString) {
        return new Date();
    }
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
        return new Date();
    }
    return date;
}
function calculateEndTime(startTime, durationMinutes) {
    const validDuration = validateServiceDuration(durationMinutes);
    const start = new Date(startTime);
    const end = new Date(start.getTime() + (validDuration * 60000));
    return end.toISOString();
}
//# sourceMappingURL=validation-helpers.js.map