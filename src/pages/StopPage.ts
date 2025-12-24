// StopPage
// Generates schedule components using AssemblyScript
// Note: This is designed to work in both Node.js and service workers

import { HourHeader, ScheduleListStart, ScheduleListEnd, ScheduleEntryTemplate } from '../components/ScheduleList';

/**
 * Builds schedule HTML for a single hour
 * Returns template strings - NO concatenation with parameters from outside
 */
export function buildScheduleForHour(
  hour: i32,
  arrivalTimes: string[],
  routeNames: string[],
  headsigns: string[]
): string {
  let html = HourHeader(hour) + ScheduleListStart();
  
  // Build each entry using template
  const template = ScheduleEntryTemplate();
  for (let i = 0; i < arrivalTimes.length; i++) {
    // Use template placeholders
    let entry = template;
    entry = entry.replace('{{TIME}}', arrivalTimes[i]);
    entry = entry.replace('{{ROUTE}}', routeNames[i]);
    const headsignPart = headsigns[i] !== '' ? ' to ' + headsigns[i] : '';
    entry = entry.replace('{{HEADSIGN}}', headsignPart);
    html += entry;
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
