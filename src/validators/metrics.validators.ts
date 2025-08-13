/**
 * Metrics Validators
 * Input validation and sanitization for metrics API endpoints
 *
 * @fileoverview Validation middleware for unified metrics API
 * @author Claude Code Assistant
 * @version 1.0.0
 * @since 2025-01-17
 */

import { Request, Response, NextFunction } from "express";
import { UnifiedError } from "../types/unified-metrics.types";

/**
 * Validation error response
 */
interface ValidationError {
  field: string;
  message: string;
  received: any;
  expected: string;
}

/**
 * Metrics Validator Class
 * Provides validation middleware for all metrics endpoints
 */
export class MetricsValidator {
  /**
   * Send validation error response
   */
  private sendValidationError(res: Response, errors: ValidationError[]): void {
    const errorResponse: UnifiedError = {
      error: true,
      message: "Validation failed",
      code: "VALIDATION_001",
      details: {
        validation_errors: errors,
        total_errors: errors.length,
      },
      timestamp: new Date().toISOString(),
      request_id: (res.getHeader("X-Request-ID") as string) || "unknown",
    };

    res.status(400).json(errorResponse);
  }

  /**
   * Validate period parameter
   */
  private validatePeriod(period: any): ValidationError | null {
    if (!period) return null; // Optional parameter

    const validPeriods = ["7d", "30d", "90d", "1y"];
    if (!validPeriods.includes(period)) {
      return {
        field: "period",
        message: "Invalid period value",
        received: period,
        expected: "One of: 7d, 30d, 90d, 1y",
      };
    }

    return null;
  }

  /**
   * Validate date format (YYYY-MM-DD)
   */
  private validateDateFormat(
    date: any,
    fieldName: string,
  ): ValidationError | null {
    if (!date) return null; // Optional parameter

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return {
        field: fieldName,
        message: "Invalid date format",
        received: date,
        expected: "YYYY-MM-DD format",
      };
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return {
        field: fieldName,
        message: "Invalid date value",
        received: date,
        expected: "Valid date in YYYY-MM-DD format",
      };
    }

    return null;
  }

  /**
   * Validate date range
   */
  private validateDateRange(
    startDate: any,
    endDate: any,
  ): ValidationError | null {
    if (!startDate || !endDate) return null; // Optional parameters

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
      return {
        field: "date_range",
        message: "Start date must be before end date",
        received: { start_date: startDate, end_date: endDate },
        expected: "start_date < end_date",
      };
    }

    // Check if date range is reasonable (not more than 1 year)
    const maxRange = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds
    if (end.getTime() - start.getTime() > maxRange) {
      return {
        field: "date_range",
        message: "Date range cannot exceed 1 year",
        received: { start_date: startDate, end_date: endDate },
        expected: "Date range <= 1 year",
      };
    }

    return null;
  }

  /**
   * Validate boolean parameter
   */
  private validateBoolean(
    value: any,
    fieldName: string,
  ): ValidationError | null {
    if (value === undefined || value === null || value === "") return null; // Optional parameter

    if (value !== "true" && value !== "false") {
      return {
        field: fieldName,
        message: "Invalid boolean value",
        received: value,
        expected: "true or false",
      };
    }

    return null;
  }

  /**
   * Validate tenant ID
   */
  private validateTenantId(tenantId: any): ValidationError | null {
    if (!tenantId) {
      return {
        field: "tenant_id",
        message: "Tenant ID is required",
        received: tenantId,
        expected: "Non-empty string",
      };
    }

    if (typeof tenantId !== "string") {
      return {
        field: "tenant_id",
        message: "Tenant ID must be a string",
        received: tenantId,
        expected: "String",
      };
    }

    // Basic UUID format validation (flexible)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tenantId)) {
      return {
        field: "tenant_id",
        message: "Invalid tenant ID format",
        received: tenantId,
        expected: "Valid UUID format",
      };
    }

    return null;
  }

  /**
   * Validate comparison type
   */
  private validateComparisonType(type: any): ValidationError | null {
    if (!type) return null; // Optional parameter

    const validTypes = ["percentage", "absolute", "both"];
    if (!validTypes.includes(type)) {
      return {
        field: "comparison_type",
        message: "Invalid comparison type",
        received: type,
        expected: "One of: percentage, absolute, both",
      };
    }

    return null;
  }

  /**
   * Validate calculation type
   */
  private validateCalculationType(type: any): ValidationError | null {
    if (!type) return null; // Optional parameter

    const validTypes = ["platform", "tenant", "all"];
    if (!validTypes.includes(type)) {
      return {
        field: "type",
        message: "Invalid calculation type",
        received: type,
        expected: "One of: platform, tenant, all",
      };
    }

    return null;
  }

  /**
   * Validate priority
   */
  private validatePriority(priority: any): ValidationError | null {
    if (!priority) return null; // Optional parameter

    const validPriorities = ["low", "normal", "high"];
    if (!validPriorities.includes(priority)) {
      return {
        field: "priority",
        message: "Invalid priority value",
        received: priority,
        expected: "One of: low, normal, high",
      };
    }

    return null;
  }

  /**
   * Validate chart type
   */
  private validateChartType(type: any): ValidationError | null {
    if (!type) {
      return {
        field: "chart_type",
        message: "Chart type is required",
        received: type,
        expected: "Non-empty string",
      };
    }

    const validTypes = [
      "platform",
      "tenant",
      "comparison",
      "revenue_trend",
      "domain_distribution",
      "appointment_status",
      "customer_growth",
      "ai_performance",
      "tenant_growth",
    ];

    if (!validTypes.includes(type)) {
      return {
        field: "chart_type",
        message: "Invalid chart type",
        received: type,
        expected: `One of: ${validTypes.join(", ")}`,
      };
    }

    return null;
  }

  // ========================= VALIDATION MIDDLEWARE =========================

  /**
   * Validate platform metrics request
   */
  validatePlatformMetricsRequest = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const errors: ValidationError[] = [];

    // Validate period
    const periodError = this.validatePeriod(req.query.period);
    if (periodError) errors.push(periodError);

    // Validate dates
    const startDateError = this.validateDateFormat(
      req.query.start_date,
      "start_date",
    );
    if (startDateError) errors.push(startDateError);

    const endDateError = this.validateDateFormat(
      req.query.end_date,
      "end_date",
    );
    if (endDateError) errors.push(endDateError);

    // Validate date range
    const dateRangeError = this.validateDateRange(
      req.query.start_date,
      req.query.end_date,
    );
    if (dateRangeError) errors.push(dateRangeError);

    // Validate boolean flags
    const includeChartsError = this.validateBoolean(
      req.query.include_charts,
      "include_charts",
    );
    if (includeChartsError) errors.push(includeChartsError);

    const includeBreakdownError = this.validateBoolean(
      req.query.include_breakdown,
      "include_breakdown",
    );
    if (includeBreakdownError) errors.push(includeBreakdownError);

    const forceRefreshError = this.validateBoolean(
      req.query.force_refresh,
      "force_refresh",
    );
    if (forceRefreshError) errors.push(forceRefreshError);

    if (errors.length > 0) {
      this.sendValidationError(res, errors);
      return;
    }

    next();
  };

  /**
   * Validate platform KPIs request
   */
  validatePlatformKPIsRequest = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const errors: ValidationError[] = [];

    // Validate period
    const periodError = this.validatePeriod(req.query.period);
    if (periodError) errors.push(periodError);

    // Validate dates
    const startDateError = this.validateDateFormat(
      req.query.start_date,
      "start_date",
    );
    if (startDateError) errors.push(startDateError);

    const endDateError = this.validateDateFormat(
      req.query.end_date,
      "end_date",
    );
    if (endDateError) errors.push(endDateError);

    // Validate date range
    const dateRangeError = this.validateDateRange(
      req.query.start_date,
      req.query.end_date,
    );
    if (dateRangeError) errors.push(dateRangeError);

    // Validate boolean flags
    const includeInsightsError = this.validateBoolean(
      req.query.include_insights,
      "include_insights",
    );
    if (includeInsightsError) errors.push(includeInsightsError);

    const includeRiskError = this.validateBoolean(
      req.query.include_risk_assessment,
      "include_risk_assessment",
    );
    if (includeRiskError) errors.push(includeRiskError);

    const forceRefreshError = this.validateBoolean(
      req.query.force_refresh,
      "force_refresh",
    );
    if (forceRefreshError) errors.push(forceRefreshError);

    if (errors.length > 0) {
      this.sendValidationError(res, errors);
      return;
    }

    next();
  };

  /**
   * Validate tenant metrics request
   */
  validateTenantMetricsRequest = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const errors: ValidationError[] = [];

    // Validate tenant ID
    const tenantIdError = this.validateTenantId(req.params.id);
    if (tenantIdError) errors.push(tenantIdError);

    // Validate period
    const periodError = this.validatePeriod(req.query.period);
    if (periodError) errors.push(periodError);

    // Validate dates
    const startDateError = this.validateDateFormat(
      req.query.start_date,
      "start_date",
    );
    if (startDateError) errors.push(startDateError);

    const endDateError = this.validateDateFormat(
      req.query.end_date,
      "end_date",
    );
    if (endDateError) errors.push(endDateError);

    // Validate date range
    const dateRangeError = this.validateDateRange(
      req.query.start_date,
      req.query.end_date,
    );
    if (dateRangeError) errors.push(dateRangeError);

    // Validate boolean flags
    const includeChartsError = this.validateBoolean(
      req.query.include_charts,
      "include_charts",
    );
    if (includeChartsError) errors.push(includeChartsError);

    const includeAIError = this.validateBoolean(
      req.query.include_ai_metrics,
      "include_ai_metrics",
    );
    if (includeAIError) errors.push(includeAIError);

    const includeBIError = this.validateBoolean(
      req.query.include_business_intelligence,
      "include_business_intelligence",
    );
    if (includeBIError) errors.push(includeBIError);

    const forceRefreshError = this.validateBoolean(
      req.query.force_refresh,
      "force_refresh",
    );
    if (forceRefreshError) errors.push(forceRefreshError);

    if (errors.length > 0) {
      this.sendValidationError(res, errors);
      return;
    }

    next();
  };

  /**
   * Validate tenant participation request
   */
  validateTenantParticipationRequest = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const errors: ValidationError[] = [];

    // Validate tenant ID
    const tenantIdError = this.validateTenantId(req.params.id);
    if (tenantIdError) errors.push(tenantIdError);

    // Validate period
    const periodError = this.validatePeriod(req.query.period);
    if (periodError) errors.push(periodError);

    // Validate dates
    const startDateError = this.validateDateFormat(
      req.query.start_date,
      "start_date",
    );
    if (startDateError) errors.push(startDateError);

    const endDateError = this.validateDateFormat(
      req.query.end_date,
      "end_date",
    );
    if (endDateError) errors.push(endDateError);

    // Validate date range
    const dateRangeError = this.validateDateRange(
      req.query.start_date,
      req.query.end_date,
    );
    if (dateRangeError) errors.push(dateRangeError);

    // Validate comparison type
    const comparisonTypeError = this.validateComparisonType(
      req.query.comparison_type,
    );
    if (comparisonTypeError) errors.push(comparisonTypeError);

    // Validate boolean flags
    const includeRankingError = this.validateBoolean(
      req.query.include_ranking,
      "include_ranking",
    );
    if (includeRankingError) errors.push(includeRankingError);

    const forceRefreshError = this.validateBoolean(
      req.query.force_refresh,
      "force_refresh",
    );
    if (forceRefreshError) errors.push(forceRefreshError);

    if (errors.length > 0) {
      this.sendValidationError(res, errors);
      return;
    }

    next();
  };

  /**
   * Validate comparison request
   */
  validateComparisonRequest = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const errors: ValidationError[] = [];

    // Validate tenant ID
    const tenantIdError = this.validateTenantId(req.params.id);
    if (tenantIdError) errors.push(tenantIdError);

    // Validate period
    const periodError = this.validatePeriod(req.query.period);
    if (periodError) errors.push(periodError);

    // Validate dates
    const startDateError = this.validateDateFormat(
      req.query.start_date,
      "start_date",
    );
    if (startDateError) errors.push(startDateError);

    const endDateError = this.validateDateFormat(
      req.query.end_date,
      "end_date",
    );
    if (endDateError) errors.push(endDateError);

    // Validate date range
    const dateRangeError = this.validateDateRange(
      req.query.start_date,
      req.query.end_date,
    );
    if (dateRangeError) errors.push(dateRangeError);

    // Validate boolean flags
    const includeAnalysisError = this.validateBoolean(
      req.query.include_analysis,
      "include_analysis",
    );
    if (includeAnalysisError) errors.push(includeAnalysisError);

    const forceRefreshError = this.validateBoolean(
      req.query.force_refresh,
      "force_refresh",
    );
    if (forceRefreshError) errors.push(forceRefreshError);

    if (errors.length > 0) {
      this.sendValidationError(res, errors);
      return;
    }

    next();
  };

  /**
   * Validate chart data request
   */
  validateChartDataRequest = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const errors: ValidationError[] = [];

    // Validate chart type
    const chartTypeError = this.validateChartType(req.params.type);
    if (chartTypeError) errors.push(chartTypeError);

    // Validate period
    const periodError = this.validatePeriod(req.query.period);
    if (periodError) errors.push(periodError);

    // Validate dates
    const startDateError = this.validateDateFormat(
      req.query.start_date,
      "start_date",
    );
    if (startDateError) errors.push(startDateError);

    const endDateError = this.validateDateFormat(
      req.query.end_date,
      "end_date",
    );
    if (endDateError) errors.push(endDateError);

    // Validate date range
    const dateRangeError = this.validateDateRange(
      req.query.start_date,
      req.query.end_date,
    );
    if (dateRangeError) errors.push(dateRangeError);

    // Validate tenant ID if provided
    if (req.query.tenant_id) {
      const tenantIdError = this.validateTenantId(req.query.tenant_id);
      if (tenantIdError) errors.push(tenantIdError);
    }

    // Validate boolean flags
    const forceRefreshError = this.validateBoolean(
      req.query.force_refresh,
      "force_refresh",
    );
    if (forceRefreshError) errors.push(forceRefreshError);

    if (errors.length > 0) {
      this.sendValidationError(res, errors);
      return;
    }

    next();
  };

  /**
   * Validate calculation request
   */
  validateCalculationRequest = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const errors: ValidationError[] = [];

    // Validate calculation type
    const calculationTypeError = this.validateCalculationType(req.body.type);
    if (calculationTypeError) errors.push(calculationTypeError);

    // Validate tenant ID if calculation type is 'tenant'
    if (req.body.type === "tenant") {
      const tenantIdError = this.validateTenantId(req.body.tenant_id);
      if (tenantIdError) errors.push(tenantIdError);
    }

    // Validate priority
    const priorityError = this.validatePriority(req.body.priority);
    if (priorityError) errors.push(priorityError);

    // Validate boolean flags
    if (req.body.force_recalculation !== undefined) {
      if (typeof req.body.force_recalculation !== "boolean") {
        errors.push({
          field: "force_recalculation",
          message: "Must be a boolean value",
          received: req.body.force_recalculation,
          expected: "true or false",
        });
      }
    }

    if (req.body.include_cache_refresh !== undefined) {
      if (typeof req.body.include_cache_refresh !== "boolean") {
        errors.push({
          field: "include_cache_refresh",
          message: "Must be a boolean value",
          received: req.body.include_cache_refresh,
          expected: "true or false",
        });
      }
    }

    if (errors.length > 0) {
      this.sendValidationError(res, errors);
      return;
    }

    next();
  };

  /**
   * Validate status request
   */
  validateStatusRequest = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const errors: ValidationError[] = [];

    // Validate boolean flags
    const includeCacheError = this.validateBoolean(
      req.query.include_cache_stats,
      "include_cache_stats",
    );
    if (includeCacheError) errors.push(includeCacheError);

    const includePerformanceError = this.validateBoolean(
      req.query.include_performance_metrics,
      "include_performance_metrics",
    );
    if (includePerformanceError) errors.push(includePerformanceError);

    if (errors.length > 0) {
      this.sendValidationError(res, errors);
      return;
    }

    next();
  };
}

export default MetricsValidator;
