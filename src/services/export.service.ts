import { Response } from "express";

export interface ExportOptions {
  format: "csv" | "excel";
  filename?: string;
  headers?: string[];
  data: any[];
  sheetName?: string;
  includeTimestamp?: boolean;
}

export class ExportService {
  /**
   * Export data to CSV format
   */
  static exportToCSV(data: any[], headers?: string[]): string {
    if (!data || data.length === 0) {
      return "";
    }

    // Use provided headers or extract from first data object
    const csvHeaders = headers || Object.keys(data[0]);

    // Create CSV header row
    const headerRow = csvHeaders
      .map((header) => this.escapeCSVField(header))
      .join(",");

    // Create CSV data rows
    const dataRows = data.map((row) => {
      return csvHeaders
        .map((header) => {
          const value = row[header];
          return this.escapeCSVField(this.formatValue(value));
        })
        .join(",");
    });

    return [headerRow, ...dataRows].join("\n");
  }

  /**
   * Export data and send as response
   */
  static async exportData(
    res: Response,
    options: ExportOptions,
  ): Promise<void> {
    try {
      const { format, filename, data, includeTimestamp = true } = options;

      if (!data || data.length === 0) {
        res.status(400).json({
          success: false,
          message: "No data available for export",
        });
        return;
      }

      const timestamp = includeTimestamp
        ? new Date().toISOString().slice(0, 19).replace(/:/g, "-")
        : "";

      const baseFilename = filename || "export";
      const finalFilename = timestamp
        ? `${baseFilename}_${timestamp}.${format}`
        : `${baseFilename}.${format}`;

      if (format === "csv") {
        const csvContent = this.exportToCSV(data, options.headers);

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${finalFilename}"`,
        );
        res.setHeader("Cache-Control", "no-cache");

        // Add BOM for better Excel compatibility
        res.send("\uFEFF" + csvContent);
      } else if (format === "excel") {
        // For Excel, we'll use a simple CSV with .xlsx extension
        // In production, you might want to use a library like 'xlsx' or 'exceljs'
        const csvContent = this.exportToCSV(data, options.headers);

        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${finalFilename}"`,
        );
        res.setHeader("Cache-Control", "no-cache");

        // For now, send as CSV with Excel MIME type
        // TODO: Implement actual Excel generation with xlsx library
        res.send("\uFEFF" + csvContent);
      } else {
        res.status(400).json({
          success: false,
          message: "Unsupported export format",
        });
      }
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to export data",
      });
    }
  }

  /**
   * Escape CSV field to handle commas, quotes, and newlines
   */
  private static escapeCSVField(field: string): string {
    if (field == null) return "";

    const stringField = String(field);

    // If field contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (
      stringField.includes(",") ||
      stringField.includes('"') ||
      stringField.includes("\n")
    ) {
      return `"${stringField.replace(/"/g, '""')}"`;
    }

    return stringField;
  }

  /**
   * Format value for export
   */
  private static formatValue(value: any): string {
    if (value == null) return "";

    if (typeof value === "object") {
      if (value instanceof Date) {
        return value.toISOString().slice(0, 19).replace("T", " ");
      }
      return JSON.stringify(value);
    }

    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }

    if (typeof value === "number") {
      // Format currency values
      if (Math.abs(value) > 0 && Math.abs(value) < 1) {
        return value.toFixed(4);
      }
      return value.toString();
    }

    return String(value);
  }

  /**
   * Prepare dashboard analytics data for export
   */
  static prepareDashboardExport(dashboardData: any): any[] {
    const exportData: any[] = [];

    // Add system metrics
    if (dashboardData.saasMetrics) {
      exportData.push({
        section: "SaaS Metrics",
        metric: "Active Tenants",
        value: dashboardData.saasMetrics.activeTenants,
        unit: "count",
      });
      exportData.push({
        section: "SaaS Metrics",
        metric: "Monthly Recurring Revenue",
        value: dashboardData.saasMetrics.mrr,
        unit: "currency",
      });
      exportData.push({
        section: "SaaS Metrics",
        metric: "Churn Rate",
        value: dashboardData.saasMetrics.churnRate,
        unit: "percentage",
      });
    }

    // Add system metrics
    if (dashboardData.systemMetrics) {
      exportData.push({
        section: "System Metrics",
        metric: "Total Appointments",
        value: dashboardData.systemMetrics.totalAppointments,
        unit: "count",
      });
      exportData.push({
        section: "System Metrics",
        metric: "Total Revenue",
        value: dashboardData.systemMetrics.totalRevenue,
        unit: "currency",
      });
    }

    return exportData;
  }

  /**
   * Prepare customers data for export
   */
  static prepareCustomersExport(customers: any[]): any[] {
    return customers.map((customer) => ({
      "Customer ID": customer.id,
      Name: customer.name,
      Email: customer.email,
      Phone: customer.phone,
      "Total Appointments": customer.appointment_count,
      "Completed Appointments": customer.completed_appointments,
      "Completion Rate (%)": Math.round(customer.completion_rate * 10) / 10,
      "Total Spent (R$)": (customer.total_spent / 100).toFixed(2),
      "Average Order Value (R$)": (customer.average_order_value / 100).toFixed(
        2,
      ),
      "Lifetime Value (R$)": (customer.lifetime_value / 100).toFixed(2),
      "Customer Segment": customer.segment,
      "Loyalty Status": customer.loyalty_status,
      "Loyalty Points": customer.loyalty_points,
      "Risk Level": customer.risk_level,
      "Days Since Last Appointment": customer.days_since_last,
      "First Appointment": customer.first_appointment,
      "Last Appointment": customer.last_appointment,
      "Customer Since": customer.created_at,
    }));
  }

  /**
   * Prepare services data for export
   */
  static prepareServicesExport(services: any[]): any[] {
    return services.map((service) => ({
      "Service ID": service.id,
      "Service Name": service.name,
      Description: service.description,
      Category: service.category,
      "Base Price (R$)": (service.base_price / 100).toFixed(2),
      "Duration (minutes)": service.duration_minutes,
      "Total Bookings": service.booking_count,
      "Completed Bookings": service.completed_bookings,
      "Cancelled Bookings": service.cancelled_bookings,
      "Completion Rate (%)": Math.round(service.completion_rate * 10) / 10,
      "Total Revenue (R$)": (service.total_revenue / 100).toFixed(2),
      "Average Booking Value (R$)": (
        service.average_booking_value / 100
      ).toFixed(2),
      "Popularity Score": service.popularity_score,
      "Health Score": service.health_score,
      "Trend Direction": service.trend_direction,
      "Bookings Last 30 Days": service.bookings_last_30_days,
      "Unique Customers": service.unique_customers,
      "Customer Retention Rate (%)":
        Math.round(service.customer_retention_rate * 10) / 10,
      "Is Active": service.is_active ? "Yes" : "No",
      "Is Trending": service.is_trending ? "Yes" : "No",
      "Needs Attention": service.needs_attention ? "Yes" : "No",
      "Created Date": service.created_at,
    }));
  }

  /**
   * Prepare appointments data for export
   */
  static prepareAppointmentsExport(appointments: any[]): any[] {
    return appointments.map((appointment) => ({
      "Appointment ID": appointment.id,
      "Customer Name": appointment.user_name,
      "Customer Phone": appointment.user_phone,
      "Customer Email": appointment.user_email,
      Service: appointment.service_name,
      Professional: appointment.professional_name,
      Date: appointment.date,
      Time: appointment.time,
      "Duration (minutes)": appointment.duration,
      Status: appointment.status,
      "Total Price (R$)": (appointment.total_price / 100).toFixed(2),
      "Customer Notes": appointment.customer_notes,
      "Internal Notes": appointment.internal_notes,
      "Created Date": appointment.created_at,
    }));
  }

  /**
   * Prepare payments data for export
   */
  static preparePaymentsExport(payments: any[]): any[] {
    return payments.map((payment) => ({
      "Payment ID": payment.id,
      "Company Name": payment.company_name || payment.business_name,
      "Tenant ID": payment.tenant_id,
      Plan: payment.plan,
      "Monthly Fee (R$)": (payment.monthly_fee / 100).toFixed(2),
      "Amount (R$)": (payment.amount / 100).toFixed(2),
      Currency: payment.currency,
      Status: payment.status,
      "Payment Status": payment.payment_status,
      "Next Due Date": payment.next_due_date,
      "Last Payment Date": payment.last_payment_date,
      "Created Date": payment.created_at,
    }));
  }
}
