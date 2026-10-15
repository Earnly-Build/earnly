import type { Application, AppStage, Notif } from "./types";

/** Account activity DTOs, shared with the browser without importing the DB. */
export interface ActivityState {
  applications: Application[];
  saved: string[];
  notifications: Notif[];
}

export type ActivityAction =
  | { type: "apply"; applicationId: string; opportunityId: string; note?: string }
  | { type: "advance"; applicationId: string; expectedStage: AppStage }
  | { type: "saved"; opportunityId: string; saved: boolean }
  | { type: "read"; notificationIds: string[] };
