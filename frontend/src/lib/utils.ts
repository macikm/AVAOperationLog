import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(isoStr?: string | null): string {
  if (!isoStr) return "-";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleString("cs-CZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return isoStr;
  }
}

export function formatDuration(duration?: any): string {
  if (duration === undefined || duration === null) return "-";
  if (typeof duration === "string") {
    // If it's a TimeSpan string like "00:00:01.4230000"
    const parts = duration.split(":");
    if (parts.length === 3) {
      const secs = parseFloat(parts[2]);
      const mins = parseInt(parts[1], 10);
      if (mins > 0) return `${mins}m ${secs.toFixed(1)}s`;
      return `${secs.toFixed(2)}s`;
    }
    return duration;
  }
  if (typeof duration === "number") {
    if (duration > 1000) return `${(duration / 1000).toFixed(2)}s`;
    return `${duration}ms`;
  }
  return String(duration);
}
