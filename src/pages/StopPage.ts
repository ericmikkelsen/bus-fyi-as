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
  content += TerminalsList(childStopIds, childStopNames);
  
  // Add routes section header if this is a parent with routes
  if (hasRoutes && childStopIds.length > 0) {
    content += `\n  <h2>Routes at ${stopName}</h2>\n`;
  }
  
  return BaseLayout(stopName, content);
}

/**
 * Adds a schedule hour block to content
 */
export function addScheduleHour(content: string, hour: i32): string {
  return content + HourHeader(hour) + ScheduleListStart();
}

/**
 * Adds a schedule entry to content
 */
export function addScheduleEntry(content: string, time: string, routeName: string, headsign: string): string {
  return content + ScheduleEntry(time, routeName, headsign);
}

/**
 * Closes a schedule hour block
 */
export function closeScheduleHour(content: string): string {
  return content + ScheduleListEnd();
}

/**
 * Wraps content in layout
 */
export function wrapInLayout(title: string, content: string): string {
  return BaseLayout(title, content);
}
