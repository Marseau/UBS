import { Appointment } from "../types/database.types";
export declare class CalendarService {
  private calendar;
  private auth;
  constructor();
  private initializeGoogleAuth;
  createCalendarEvent(appointment: Appointment): Promise<CalendarEventResult>;
  updateCalendarEvent(appointment: Appointment): Promise<CalendarEventResult>;
  cancelCalendarEvent(appointment: Appointment): Promise<CalendarEventResult>;
  checkCalendarConflicts(
    tenantId: string,
    startTime: string,
    endTime: string,
    excludeEventId?: string,
  ): Promise<CalendarConflictResult>;
  getAvailableSlots(
    tenantId: string,
    date: string,
    duration: number,
    businessHours: {
      start: string;
      end: string;
    },
  ): Promise<AvailableSlot[]>;
  syncWithCalendar(tenantId: string): Promise<SyncResult>;
  private buildEventDescription;
  private formatLocation;
  private buildAttendees;
  private getColorForDomain;
  private mapAppointmentStatus;
  private getCalendarId;
  private hasTimeOverlap;
  private generateAvailableSlots;
  private getSyncToken;
  private saveSyncToken;
}
export interface CalendarEventResult {
  success: boolean;
  eventId?: string;
  eventUrl?: string;
  message: string;
}
export interface CalendarConflictResult {
  hasConflicts: boolean;
  conflicts: Array<{
    id: string;
    summary: string;
    start: string;
    end: string;
  }>;
  message: string;
}
export interface AvailableSlot {
  start: string;
  end: string;
  available: boolean;
}
export interface SyncResult {
  success: boolean;
  created: number;
  updated: number;
  deleted: number;
  message: string;
}
export default CalendarService;
//# sourceMappingURL=calendar.service.d.ts.map
