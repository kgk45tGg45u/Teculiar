import { Badge, type BadgeTone } from "./badge";

type StatusBadgeProps = {
  label: string;
  status?: string;
  tone?: BadgeTone;
  className?: string;
};

const statusTone: Record<string, BadgeTone> = {
  ACTIVE: "success",
  PAID: "success",
  OPEN: "accent",
  PENDING: "warning",
  OVERDUE: "warning",
  SUSPENDED: "warning",
  FAILED: "danger",
  CANCELLED: "danger",
  CANCELED: "danger",
  CLOSED: "neutral"
};

export function StatusBadge({ label, status, tone, className }: StatusBadgeProps) {
  const key = (status ?? label).toUpperCase();
  return (
    <Badge className={className} tone={tone ?? statusTone[key] ?? "neutral"}>
      {label}
    </Badge>
  );
}
