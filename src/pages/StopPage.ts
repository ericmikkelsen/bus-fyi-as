// StopPage
// Generates schedule components using AssemblyScript
// Note: This is designed to work in both Node.js and service workers

import { HourHeader, ScheduleListStart, ScheduleListEnd, ScheduleEntry } from '../components/ScheduleList';

/**
 * Builds schedule HTML for a single hour
 * All string manipulation happens in AssemblyScript
 */
export function buildScheduleForHour(
  hour: i32,
  arrivalTimes: string[],
  routeNames: string[],
  headsigns: string[]
): string {
  let html = HourHeader(hour) + ScheduleListStart();
  
  for (let i = 0; i < arrivalTimes.length; i++) {
    html += ScheduleEntry(arrivalTimes[i], routeNames[i], headsigns[i]);
  }
  
  html += ScheduleListEnd();
  return html;
}

/**
 * Builds complete schedule HTML for all hours
 * All string manipulation happens in AssemblyScript
 */
export function buildCompleteSchedule(
  hours: i32[],
  hourArrivalTimes: string[][],
  hourRouteNames: string[][],
  hourHeadsigns: string[][]
): string {
  let html = '';
  
  for (let i = 0; i < hours.length; i++) {
    html += buildScheduleForHour(
      hours[i],
      hourArrivalTimes[i],
      hourRouteNames[i],
      hourHeadsigns[i]
    );
  }
  
  return html;
}
