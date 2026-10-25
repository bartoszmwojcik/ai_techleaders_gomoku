import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";

export type Status = "info" | "success" | "warning" | "danger";

// One place for what each status looks like: an icon, a text colour and a border colour. Errors and
// warnings interrupt a screen reader (role=alert); information and success wait (role=status).
export const STATUS = {
  info: { Icon: Info, role: "status", text: "text-status-info", border: "border-status-info" },
  success: { Icon: CircleCheck, role: "status", text: "text-status-success", border: "border-status-success" },
  warning: { Icon: TriangleAlert, role: "alert", text: "text-status-warning", border: "border-status-warning" },
  danger: { Icon: CircleX, role: "alert", text: "text-status-danger", border: "border-status-danger" },
} as const;
