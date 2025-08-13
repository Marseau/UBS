import { BusinessDomain } from "../types/database.types";
export declare class AnalyticsService {
  constructor();
  getTenantAnalytics(
    tenantId: string,
    period?: string,
  ): Promise<TenantAnalytics>;
  private getAppointmentStats;
  private getRevenueStats;
  private getCustomerStats;
  private getServiceStats;
  private getAIStats;
  private getConversionStats;
  getDomainBenchmarks(
    domain?: BusinessDomain,
  ): Promise<Record<string, DomainBenchmarks>>;
  getRealTimeDashboard(tenantId: string): Promise<RealTimeDashboard>;
  private getDateRange;
  private getPreviousDateRange;
  private calculateGrowthRate;
  private groupByDay;
  private groupRevenueByDay;
  private generateSummary;
  private calculateHealthScore;
}
interface DateRange {
  start: string;
  end: string;
}
interface DailyStats {
  date: string;
  count: number;
}
interface DailyRevenue {
  date: string;
  revenue: number;
}
export interface TenantAnalytics {
  period: string;
  dateRange: DateRange;
  appointments: AppointmentStats;
  revenue: RevenueStats;
  customers: CustomerStats;
  services: ServiceStats;
  ai: AIStats;
  conversion: ConversionStats;
  summary: AnalyticsSummary;
}
export interface AppointmentStats {
  total: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  noShow: number;
  completionRate: number;
  cancellationRate: number;
  noShowRate: number;
  growthRate: number;
  dailyStats: DailyStats[];
  statusDistribution: Record<string, number>;
}
export interface RevenueStats {
  total: number;
  totalRevenue: number;
  potentialRevenue: number;
  averageTicket: number;
  revenueGrowth: number;
  growthRate: number;
  dailyRevenue: DailyRevenue[];
  dailyStats: DailyRevenue[];
  lostRevenue: number;
}
export interface CustomerStats {
  new: number;
  newCustomers: number;
  returningCustomers: number;
  total: number;
  totalUniqueCustomers: number;
  active: number;
  retentionRate: number;
  customerGrowth: number;
  growthRate: number;
  dailyStats: DailyStats[];
}
export interface ServiceStats {
  popular: Array<{
    id: string;
    name: string;
    totalBookings: number;
    completedBookings: number;
    revenue: number;
    averagePrice: number;
    averageTicket: number;
    completionRate: number;
    appointments: number;
  }>;
  topServices: Array<{
    id: string;
    name: string;
    totalBookings: number;
    completedBookings: number;
    revenue: number;
    averagePrice: number;
    completionRate: number;
  }>;
  totalServices: number;
  mostPopular: any;
  mostProfitable: any;
}
export interface AIStats {
  totalMessages: number;
  userMessages: number;
  aiResponses: number;
  intentAccuracy: number;
  accuracy: number;
  coverage: number;
  responseTime: number;
  conversionRate: number;
  satisfaction: number;
  totalInteractions: number;
  intentDistribution: Record<string, number>;
  aiBookings: number;
  aiConversionRate: number;
  averageConfidence: number;
}
export interface ConversionStats {
  rate: number;
  uniqueVisitors: number;
  inquiries: number;
  bookingRequests: number;
  actualBookings: number;
  completedBookings: number;
  inquiryToBookingRate: number;
  bookingToCompletionRate: number;
  overallConversionRate: number;
  growthRate: number;
  funnel: {
    visitors: number;
    interested: number;
    appointments: number;
    completed: number;
  };
}
export interface DomainBenchmarks {
  domain: BusinessDomain | string;
  participatingTenants: number;
  benchmarks: {
    averageAppointmentsPerMonth: number;
    averageCompletionRate: number;
    averageRevenuePerMonth: number;
    averageTicketSize: number;
    averageAIAccuracy: number;
    averageConversionRate: number;
    averageRevenuePerCustomer: number;
  };
}
export interface RealTimeDashboard {
  todayStats: {
    totalAppointments: number;
    completed: number;
    upcoming: number;
    revenue: number;
  };
  todayAppointments: any[];
  recentConversations: any[];
  activeConversations: number;
  lastUpdated: string;
}
export interface AnalyticsSummary {
  totalAppointments: number;
  totalRevenue: number;
  newCustomers: number;
  insights: string[];
  healthScore: number;
}
export default AnalyticsService;
//# sourceMappingURL=analytics.service.d.ts.map
