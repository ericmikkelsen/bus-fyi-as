// StopPage
// Generates complete stop page HTML using AssemblyScript
// Note: This is designed to work in both Node.js and service workers
// Using as-bind for proper WASM memory management

import { HourHeader, ScheduleListStart, ScheduleListEnd, ScheduleEntry } from '../components/ScheduleList';
import { StopHeader } from '../components/StopHeader';
import { TerminalsList } from '../components/TerminalsList';

/**
 * Builds COMPLETE stop page HTML (including <html>, <head>, <body> tags)
 * This is called ONCE per stop page to minimize JavaScript/WASM boundary crossings
 * All HTML generation and formatting happens in AssemblyScript
 * JavaScript only prepares data - NO string operations
 * 
 * @param stopName - Name of the stop
 * @param stopId - Stop ID
 * @param parentStopId - Parent stop ID (empty string if no parent)
 * @param parentStopName - Parent stop name (empty string if no parent)
 * @param agency - Agency name
 * @param terminalStops - Array of terminal stop IDs
 * @param terminalNames - Array of terminal stop names (parallel to terminalStops)
 * @param hourDisplays - Array of PRE-FORMATTED hour displays (e.g., "9:00 AM")
 * @param hourFormattedTimes - Array of PRE-FORMATTED times (e.g., "9:00 AM", "9:30 AM")
 * @param hourDatetimes - Array of datetime attributes (e.g., "09:00", "09:30")
 * @param hourRouteNames - Array of route names for each hour
 * @param hourHeadsigns - Array of headsigns for each hour
 * @param hourServiceDays - Array of service day strings for each hour
 */
export function buildStopPageHTML(
  stopName: string,
  stopId: string,
  parentStopId: string,
  parentStopName: string,
  agency: string,
  terminalStops: string[],
  terminalNames: string[],
  hourDisplays: string[],
  hourFormattedTimes: string[][],
  hourDatetimes: string[][],
  hourRouteNames: string[][],
  hourHeadsigns: string[][],
  hourServiceDays: string[][]
): string {
  // Start HTML document
  let html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n';
  html += '  <meta charset="UTF-8">\n';
  html += '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
  html += '  <title>' + stopName + '</title>\n';
  html += '</head>\n<body>\n';
  
  // Build stop header (with parent link if applicable)
  html += StopHeader(stopName, stopId, parentStopId, parentStopName, agency);
  
  // Build terminals list if there are any
  if (terminalStops.length > 0) {
    html += TerminalsList(agency, stopId, terminalStops, terminalNames);
  }
  
  // Build routes section header (only if there are routes)
  if (hourDisplays.length > 0) {
    html += '<h2>Routes at ' + stopName + '</h2>\n';
  }
  
  // Build schedule for each hour
  for (let i = 0; i < hourDisplays.length; i++) {
    const hourDisplay = hourDisplays[i];
    const formattedTimes = hourFormattedTimes[i];
    const datetimes = hourDatetimes[i];
    const routes = hourRouteNames[i];
    const headsigns = hourHeadsigns[i];
    const serviceDays = hourServiceDays[i];
    
    html += HourHeader(hourDisplay);
    html += ScheduleListStart();
    
    for (let j = 0; j < formattedTimes.length; j++) {
      html += ScheduleEntry(formattedTimes[j], datetimes[j], routes[j], headsigns[j], serviceDays[j]);
    }
    
    html += ScheduleListEnd();
  }
  
  // Close HTML document
  html += '</body>\n</html>';
  
  return html;
}
