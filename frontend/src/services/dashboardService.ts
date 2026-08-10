import type { DashboardStats } from "@truco/shared";
import { apiRequest } from "./api";

export function getDashboardStats(): Promise<DashboardStats> {
  return apiRequest<DashboardStats>("/dashboard");
}
