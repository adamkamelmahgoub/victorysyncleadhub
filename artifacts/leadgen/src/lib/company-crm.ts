import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
export * from "../../../api-server/src/lib/company-model";
import type { Company } from "../../../api-server/src/lib/company-model";
export const companiesKey = ["company-crm", "companies"];
export function useCompanies() {
  return useQuery<Company[]>({
    queryKey: companiesKey,
    queryFn: () => apiFetch("/api/companies"),
  });
}
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function displayDate(date: string | null) {
  return date
    ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Not scheduled";
}
export const stageColors: Record<string, string> = {
  new: "#64748b",
  contacted: "#475569",
  engaged: "#2563eb",
  qualified: "#7c3aed",
  meeting_booked: "#16a34a",
  trial_booked: "#c2410c",
  trial_active: "#0f766e",
  trial_completed: "#b45309",
  client: "#15803d",
  disqualified: "#9f1239",
};
