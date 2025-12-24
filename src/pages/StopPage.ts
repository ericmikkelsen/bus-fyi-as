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
 * Adds a schedule hour block to content
 * Returns the hour header and list start separately to avoid intermediate string concatenation
 */
export function getScheduleHourStart(hour: i32): string {
  const header = HourHeader(hour);
  const listStart = ScheduleListStart();
  return header + listStart;
}

/**
 * Gets a schedule entry HTML
 * Returns the entry HTML without concatenation to avoid reference counting issues
 */
export function getScheduleEntry(time: string, routeName: string, headsign: string): string {
  return ScheduleEntry(time, routeName, headsign);
}

/**
 * Gets the schedule hour closing tag
 */
export function getScheduleHourEnd(): string {
  return ScheduleListEnd();
}

/**
 * Wraps content in layout
 */
export function wrapInLayout(title: string, content: string): string {
  return BaseLayout(title, content);
}
