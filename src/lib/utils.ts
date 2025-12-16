import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Check if a booking is overnight (end time < start time means it spans midnight)
export function isOvernightBooking(startTime: string, endTime: string): boolean {
  return endTime < startTime || endTime === '00:00';
}

// Format time slot with overnight indicator
export function formatTimeSlot(startTime: string, endTime: string): string {
  const overnight = isOvernightBooking(startTime, endTime);
  if (overnight) {
    return `${startTime} - ${endTime} (next day)`;
  }
  return `${startTime} - ${endTime}`;
}

// Convert 24h time to 12h format
export function convertTo12Hour(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

// Format time slot in 12h format with overnight indicator
export function formatTimeSlot12h(startTime: string, endTime: string): string {
  const overnight = isOvernightBooking(startTime, endTime);
  const start12 = convertTo12Hour(startTime);
  const end12 = convertTo12Hour(endTime);
  if (overnight) {
    return `${start12} - ${end12} (next day)`;
  }
  return `${start12} - ${end12}`;
}
