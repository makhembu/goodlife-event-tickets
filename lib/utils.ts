import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const KE_TZ = "Africa/Nairobi";

export function fmtDate(date: string | Date) {
  return new Date(date).toLocaleString("en-KE", { timeZone: KE_TZ });
}

export function fmtTime(date: string | Date) {
  return new Date(date).toLocaleTimeString("en-KE", { timeZone: KE_TZ, hour: "2-digit", minute: "2-digit" });
}

export function fmtDateShort(date: string | Date) {
  return new Date(date).toLocaleDateString("en-KE", { timeZone: KE_TZ });
}
