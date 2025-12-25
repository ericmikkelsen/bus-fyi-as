// StopPageProcessor
// Processes CSV data and generates complete stop page HTML in AssemblyScript
// JavaScript ONLY reads files and writes results - ALL processing happens here

import { HourHeader, ScheduleListStart, ScheduleListEnd, ScheduleEntry } from '../components/ScheduleList';
import { StopHeader } from '../components/StopHeader';
import { TerminalsList } from '../components/TerminalsList';

/**
 * Parse a single CSV line, handling quoted fields with commas
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line.charAt(i);
    
    if (char == '"') {
      inQuotes = !inQuotes;
    } else if (char == ',' && !inQuotes) {
      fields.push(field.trim());
      field = '';
    } else {
      field += char;
    }
  }
  
  fields.push(field.trim());
  return fields;
}

/**
 * Parse CSV content into array of arrays
 * FAST: All done in WASM
 */
function parseCSV(content: string): string[][] {
  const result: string[][] = [];
  let line = '';
  
  for (let i = 0; i < content.length; i++) {
    const char = content.charAt(i);
    if (char == '\n' || char == '\r') {
      if (line.length > 0) {
        result.push(parseCSVLine(line));
        line = '';
      }
    } else {
      line += char;
    }
  }
  
  if (line.length > 0) {
    result.push(parseCSVLine(line));
  }
  
  return result;
}

/**
 * Extract hour from GTFS time string
 * "08:30:00" → 8
 * "14:45:00" → 14
 * "25:30:00" → 25 (next day)
 */
function getHourFromTime(timeStr: string): i32 {
  if (timeStr.length == 0) return 0;
  
  let colonIndex = -1;
  for (let i = 0; i < timeStr.length; i++) {
    if (timeStr.charAt(i) == ':') {
      colonIndex = i;
      break;
    }
  }
  
  if (colonIndex < 0) return 0;
  
  const hourStr = timeStr.substring(0, colonIndex);
  return I32.parseInt(hourStr);
}

/**
 * Format time for display
 * "08:30:00" → "8:30 AM"
 * "14:45:00" → "2:45 PM"
 * "25:30:00" → "1:30 AM" (next day)
 */
function formatTime(timeStr: string): string {
  if (timeStr.length < 5) return timeStr;
  
  // Find first colon
  let firstColon = -1;
  for (let i = 0; i < timeStr.length; i++) {
    if (timeStr.charAt(i) == ':') {
      firstColon = i;
      break;
    }
  }
  if (firstColon < 0) return timeStr;
  
  // Find second colon
  let secondColon = -1;
  for (let i = firstColon + 1; i < timeStr.length; i++) {
    if (timeStr.charAt(i) == ':') {
      secondColon = i;
      break;
    }
  }
  if (secondColon < 0) secondColon = timeStr.length;
  
  const hourStr = timeStr.substring(0, firstColon);
  const minuteStr = timeStr.substring(firstColon + 1, secondColon);
  
  let hour = I32.parseInt(hourStr);
  if (hour >= 24) hour -= 24; // Handle next day times
  
  const isPM = hour >= 12;
  if (hour == 0) hour = 12;
  else if (hour > 12) hour -= 12;
  
  const hourDisplay = hour.toString();
  const period = isPM ? ' PM' : ' AM';
  
  return hourDisplay + ':' + minuteStr + period;
}

/**
 * Get datetime attribute for <time> element
 * "08:30:00" → "08:30"
 */
function getDatetime(timeStr: string): string {
  if (timeStr.length < 5) return timeStr;
  
  let colonIndex = -1;
  for (let i = 0; i < timeStr.length; i++) {
    if (timeStr.charAt(i) == ':') {
      colonIndex = i;
      break;
    }
  }
  if (colonIndex < 0) return timeStr;
  
  let secondColon = -1;
  for (let i = colonIndex + 1; i < timeStr.length; i++) {
    if (timeStr.charAt(i) == ':') {
      secondColon = i;
      break;
    }
  }
  if (secondColon < 0) return timeStr.substring(0, colonIndex + 3);
  
  return timeStr.substring(0, secondColon);
}

/**
 * Format hour display
 * 8 → "8:00 AM"
 * 14 → "2:00 PM"
 */
function formatHourDisplay(hour: i32): string {
  let displayHour = hour;
  if (displayHour >= 24) displayHour -= 24;
  
  const isPM = displayHour >= 12;
  if (displayHour == 0) displayHour = 12;
  else if (displayHour > 12) displayHour -= 12;
  
  const period = isPM ? ' PM' : ' AM';
  return displayHour.toString() + ':00' + period;
}

/**
 * Process stop CSV and generate complete HTML page
 * THIS IS THE MAIN ENTRY POINT - JavaScript only reads CSV and writes result
 * 
 * @param stopName - Name of the stop
 * @param stopId - Stop ID
 * @param parentStopId - Parent stop ID (empty if no parent)
 * @param parentStopName - Parent stop name (empty if no parent)
 * @param agencyName - Agency name
 * @param childStopIds - Child stop IDs (for terminals list)
 * @param childStopNames - Child stop names
 * @param stopTimesCSV - Raw CSV content from stop_times file
 * @param tripData - Raw CSV content from trips file (trip_id,route_id,service_id,trip_headsign)
 * @param routeData - Raw CSV content from routes file (route_id,route_short_name,route_long_name)
 * @param calendarData - Raw CSV content from calendar file (service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday)
 * 
 * @returns Complete HTML page as string
 */
export function processStopAndGenerateHTML(
  stopName: string,
  stopId: string,
  parentStopId: string,
  parentStopName: string,
  agencyName: string,
  childStopIds: string[],
  childStopNames: string[],
  stopTimesCSV: string,
  tripData: string,
  routeData: string,
  calendarData: string
): string {
  // Parse CSVs in WASM (FAST!)
  const stopTimeRows = parseCSV(stopTimesCSV);
  const tripRows = parseCSV(tripData);
  const routeRows = parseCSV(routeData);
  const calendarRows = parseCSV(calendarData);
  
  // Build fast lookup maps
  const tripMap = new Map<string, string[]>();  // trip_id → [route_id, service_id, trip_headsign]
  for (let i = 1; i < tripRows.length; i++) {  // Skip header
    const row = tripRows[i];
    if (row.length >= 4) {
      tripMap.set(row[0], [row[1], row[2], row[3]]);
    }
  }
  
  const routeMap = new Map<string, string[]>();  // route_id → [route_short_name, route_long_name]
  for (let i = 1; i < routeRows.length; i++) {
    const row = routeRows[i];
    if (row.length >= 3) {
      routeMap.set(row[0], [row[1], row[2]]);
    }
  }
  
  const calendarMap = new Map<string, string[]>();  // service_id → [mon,tue,wed,thu,fri,sat,sun]
  for (let i = 1; i < calendarRows.length; i++) {
    const row = calendarRows[i];
    if (row.length >= 8) {
      calendarMap.set(row[0], [row[1], row[2], row[3], row[4], row[5], row[6], row[7]]);
    }
  }
  
  // Extract stop times data (skip header row)
  const arrivalTimes: string[] = [];
  const tripIds: string[] = [];
  
  for (let i = 1; i < stopTimeRows.length; i++) {
    const row = stopTimeRows[i];
    if (row.length >= 3) {
      tripIds.push(row[0]);  // trip_id
      arrivalTimes.push(row[1]);  // arrival_time
    }
  }
  
  // Group by hour in WASM (FAST!)
  const hoursSet = new Set<i32>();
  for (let i = 0; i < arrivalTimes.length; i++) {
    hoursSet.add(getHourFromTime(arrivalTimes[i]));
  }
  
  // Convert Set to Array - AssemblyScript way
  const hoursArray: i32[] = [];
  const setValues = hoursSet.values();
  for (let i = 0; i < setValues.length; i++) {
    hoursArray.push(setValues[i]);
  }
  
  // Sort hours
  hoursArray.sort();
  
  // Start HTML document
  let html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n';
  html += '  <meta charset="UTF-8">\n';
  html += '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
  html += '  <title>' + stopName + '</title>\n';
  html += '</head>\n<body>\n';
  
  // Build stop header
  html += StopHeader(stopName, stopId, parentStopId, parentStopName, agencyName);
  
  // Build terminals list if there are any
  if (childStopIds.length > 0) {
    html += TerminalsList(agencyName, stopId, childStopIds, childStopNames);
  }
  
  // Build routes section header (only if there are routes)
  if (hoursArray.length > 0) {
    html += '<h2>Routes at ' + stopName + '</h2>\n';
  }
  
  // Build schedule for each hour
  for (let h = 0; h < hoursArray.length; h++) {
    const hour = hoursArray[h];
    const hourDisplay = formatHourDisplay(hour);
    
    html += HourHeader(hourDisplay);
    html += ScheduleListStart();
    
    // Get entries for this hour, sorted by time
    const entriesForHour: string[] = [];
    const indicesForHour: i32[] = [];
    
    for (let i = 0; i < arrivalTimes.length; i++) {
      if (getHourFromTime(arrivalTimes[i]) == hour) {
        indicesForHour.push(i);
      }
    }
    
    // Sort indices by arrival time
    for (let i = 0; i < indicesForHour.length - 1; i++) {
      for (let j = i + 1; j < indicesForHour.length; j++) {
        const idx1 = indicesForHour[i];
        const idx2 = indicesForHour[j];
        if (arrivalTimes[idx1] > arrivalTimes[idx2]) {
          // Swap
          indicesForHour[i] = idx2;
          indicesForHour[j] = idx1;
        }
      }
    }
    
    // Build schedule entries
    for (let i = 0; i < indicesForHour.length; i++) {
      const idx = indicesForHour[i];
      const arrivalTime = arrivalTimes[idx];
      const tripId = tripIds[idx];
      
      // Lookup trip, route, and calendar
      const tripInfo = tripMap.get(tripId);
      if (!tripInfo) continue;
      
      const routeId = tripInfo[0];
      const serviceId = tripInfo[1];
      const headsign = tripInfo[2];
      
      const routeInfo = routeMap.get(routeId);
      const routeName = routeInfo ? (routeInfo[0].length > 0 ? routeInfo[0] : routeInfo[1]) : 'Unknown';
      
      const calendarInfo = calendarMap.get(serviceId);
      let serviceDays = '';
      if (calendarInfo) {
        const days: string[] = [];
        if (calendarInfo[0] == '1') days.push('Mon');
        if (calendarInfo[1] == '1') days.push('Tue');
        if (calendarInfo[2] == '1') days.push('Wed');
        if (calendarInfo[3] == '1') days.push('Thu');
        if (calendarInfo[4] == '1') days.push('Fri');
        if (calendarInfo[5] == '1') days.push('Sat');
        if (calendarInfo[6] == '1') days.push('Sun');
        serviceDays = days.join(',');
      }
      
      // Format time and build entry
      const formattedTime = formatTime(arrivalTime);
      const datetime = getDatetime(arrivalTime);
      
      html += ScheduleEntry(formattedTime, datetime, routeName, headsign, serviceDays);
    }
    
    html += ScheduleListEnd();
  }
  
  // Close HTML document
  html += '</body>\n</html>';
  
  return html;
}
