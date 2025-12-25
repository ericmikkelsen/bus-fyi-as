// StopPage
// Generates complete stop page HTML using AssemblyScript
// Note: This is designed to work in both Node.js and service workers
// Using as-bind for proper WASM memory management

import { HourHeader, ScheduleListStart, ScheduleListEnd, ScheduleEntry } from '../components/ScheduleList';
import { StopHeader } from '../components/StopHeader';
import { TerminalsList } from '../components/TerminalsList';

/**
 * Builds complete stop page content (everything inside <body>)
 * This is called ONCE per stop page to minimize JavaScript/WASM boundary crossings
 * All HTML generation happens in AssemblyScript
 * 
 * @param stopName - Name of the stop
 * @param stopId - Stop ID
 * @param parentStopId - Parent stop ID (empty string if no parent)
 * @param parentStopName - Parent stop name (empty string if no parent)
 * @param agency - Agency name
 * @param terminalStops - Array of terminal stop IDs
 * @param terminalNames - Array of terminal stop names (parallel to terminalStops)
 * @param hours - Array of hours with schedules
 * @param hourArrivalTimes - Array of GTFS times for each hour (e.g., "09:00:00")
 * @param hourRouteNames - Array of route names for each hour
 * @param hourHeadsigns - Array of headsigns for each hour
 * @param hourServiceDays - Array of service day strings for each hour
 */
export function buildStopPageContent(
  stopName: string,
  stopId: string,
  parentStopId: string,
  parentStopName: string,
  agency: string,
  terminalStops: string[],
  terminalNames: string[],
  hours: i32[],
  hourArrivalTimes: string[][],
  hourRouteNames: string[][],
  hourHeadsigns: string[][],
  hourServiceDays: string[][]
): string {
  // Build stop header (with parent link if applicable)
  let html = StopHeader(stopName, stopId, parentStopId, parentStopName, agency);
  
  // Build terminals list if there are any
  if (terminalStops.length > 0) {
    html += TerminalsList(agency, stopId, terminalStops, terminalNames);
  }
  
  // Build routes section header (only if there are routes)
  if (hours.length > 0) {
    html += '<h2>Routes at ' + stopName + '</h2>\n';
  }
  
  // Build schedule for each hour
  for (let i = 0; i < hours.length; i++) {
    const hour = hours[i];
    const times = hourArrivalTimes[i];
    const routes = hourRouteNames[i];
    const headsigns = hourHeadsigns[i];
    const serviceDays = hourServiceDays[i];
    
    html += HourHeader(hour);
    html += ScheduleListStart();
    
    for (let j = 0; j < times.length; j++) {
      html += ScheduleEntry(times[j], routes[j], headsigns[j], serviceDays[j]);
    }
    
    html += ScheduleListEnd();
  }
  
  return html;
}
