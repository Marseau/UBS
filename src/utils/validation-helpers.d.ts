import { AppointmentStatus } from "../types/database.types";
export declare function validateServiceDuration(
  durationMinutes: number | null | undefined,
): number;
export declare function validateServicePrice(
  basePrice: number | null | undefined,
): number;
export declare function validateAppointmentStatus(
  status: string,
): AppointmentStatus;
export declare function getServiceConfigProperty(
  serviceConfig: any,
  property: string,
): any;
export declare function validateString(
  value: string | undefined,
  defaultValue?: string,
): string;
export declare function validateArray<T>(
  value: T[] | undefined,
  defaultValue?: T[],
): T[];
export declare function validateDate(dateString: string | undefined): Date;
export declare function calculateEndTime(
  startTime: string,
  durationMinutes: number | null | undefined,
): string;
//# sourceMappingURL=validation-helpers.d.ts.map
