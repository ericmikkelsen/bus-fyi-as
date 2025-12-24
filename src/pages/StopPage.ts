// StopPage
// Generates a complete stop page using components and layout

import { BaseLayout } from '../layouts/BaseLayout';
import { StopHeader } from '../components/StopHeader';
import { TerminalsList } from '../components/TerminalsList';
import { HourHeader, ScheduleListStart, ScheduleListEnd, ScheduleEntry } from '../components/ScheduleList';

/**
 * Generates a complete stop page
 * Note: This is designed to work in both Node.js and service workers
 */
export function generateStopPage(
  stopName: string,
  stopId: string,
  parentStopId: string,
  parentStopName: string,
  childStopIds: string[],
  childStopNames: string[],
  hasRoutes: bool
): string {
  let content = StopHeader(stopName, stopId, parentStopId, parentStopName);
  // Pass stopId as parentStopId for TerminalsList to create nested paths
  content += TerminalsList(stopId, childStopIds, childStopNames);
  
  // Add routes section header if this is a parent with routes
  if (hasRoutes && childStopIds.length > 0) {
    content += `\n  <h2>Routes at ${stopName}</h2>\n`;
  }
  
  return BaseLayout(stopName, content);
}

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

/**
 * Wraps content in layout
 */
export function wrapInLayout(title: string, content: string): string {
  return BaseLayout(title, content);
}
