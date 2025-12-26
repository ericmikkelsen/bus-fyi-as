// StopPageProcessor
// Processes CSV data and generates complete stop page HTML in AssemblyScript
// JavaScript ONLY reads files and writes results - ALL processing happens here

import { HourHeader, ScheduleListStart, ScheduleListEnd, ScheduleEntry } from '../components/ScheduleList';
import { StopHeader } from '../components/StopHeader';
import { TerminalsList } from '../components/TerminalsList';

/**
 * Parse a single CSV line, handling quoted fields with commas
 * Using Array<string> instead of string concatenation to avoid managed object issues
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  const fieldCodes: i32[] = [];  // Use i32 array for char codes - actual AS stdlib signature
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const charCode = line.charCodeAt(i);  // Get number, not string!
    
    if (charCode == 34) {  // '"' = 34
      inQuotes = !inQuotes;
    } else if (charCode == 44 && !inQuotes) {  // ',' = 44
      // Convert codes to string only once
      fields.push(String.fromCharCodes(fieldCodes).trim());
      fieldCodes.length = 0;
    } else {
      fieldCodes.push(charCode);
    }
  }
  
  fields.push(String.fromCharCodes(fieldCodes).trim());
  return fields;
}

/**
 * Parse CSV content into array of arrays
 * FAST: All done in WASM
 * Using Array<string> instead of string concatenation
 */
function parseCSV(content: string): string[][] {
  const result: string[][] = [];
  const lineCodes: i32[] = [];  // Use i32 array for char codes - actual AS stdlib signature
  
  for (let i = 0; i < content.length; i++) {
    const charCode = content.charCodeAt(i);  // Get number, not string!
    if (charCode == 10 || charCode == 13) {  // '\n' = 10, '\r' = 13
      if (lineCodes.length > 0) {
        result.push(parseCSVLine(String.fromCharCodes(lineCodes)));
        lineCodes.length = 0;
      }
    } else {
      lineCodes.push(charCode);
    }
  }
  
  if (lineCodes.length > 0) {
    result.push(parseCSVLine(String.fromCharCodes(lineCodes)));
  }
  
  return result;
}

/**
 * Extract hour from GTFS time string using charCodeAt (no parseInt!)
 * "08:30:00" → 8
 * "14:45:00" → 14
 * "25:30:00" → 25 (next day)
 */
function getHourFromTime(timeStr: string): i32 {
  if (timeStr.length < 2) return 0;
  
  // Use charCodeAt instead of parseInt
  const char0 = timeStr.charCodeAt(0);
  const char1 = timeStr.charCodeAt(1);
  
  if (char0 < 48 || char0 > 57) return 0;
  
  if (char1 == 58) { // ':' = 58
    return char0 - 48; // Single digit hour
  }
  
  if (char1 < 48 || char1 > 57) return 0;
  
  return (char0 - 48) * 10 + (char1 - 48); // Two digit hour
}

/**
 * Format time for display using charCodeAt (no parseInt or toString!)
 * "08:30:00" → "8:30 AM"
 * "14:45:00" → "2:45 PM"
 * "25:30:00" → "1:30 AM" (next day)
 */
function formatTime(timeStr: string): string {
  if (timeStr.length < 5) return timeStr;
  
  // Extract hour using charCodeAt
  let hour = getHourFromTime(timeStr);
  if (hour >= 24) hour -= 24; // Handle next day times
  
  const isPM = hour >= 12;
  if (hour == 0) hour = 12;
  else if (hour > 12) hour -= 12;
  
  // Build hour string manually (no toString!)
  let hourDisplay: string;
  if (hour < 10) {
    hourDisplay = String.fromCharCode(48 + hour); // '0' = 48
  } else if (hour >= 10 && hour < 20) {
    hourDisplay = '1' + String.fromCharCode(48 + (hour - 10));
  } else {
    hourDisplay = '2' + String.fromCharCode(48 + (hour - 20));
  }
  
  // Extract minutes (chars 3-4 or 2-3 depending on hour length)
  const colonPos = timeStr.indexOf(':');
  const minuteStart = colonPos + 1;
  const minuteStr = timeStr.substring(minuteStart, minuteStart + 2);
  
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
    if (timeStr.charCodeAt(i) == 58) {  // ':' = 58, use charCodeAt!
      colonIndex = i;
      break;
    }
  }
  if (colonIndex < 0) return timeStr;
  
  let secondColon = -1;
  for (let i = colonIndex + 1; i < timeStr.length; i++) {
    if (timeStr.charCodeAt(i) == 58) {  // ':' = 58
      secondColon = i;
      break;
    }
  }
  if (secondColon < 0) return timeStr.substring(0, colonIndex + 3);
  
  return timeStr.substring(0, secondColon);
}

/**
 * Format hour display using manual string building (no toString!)
 * 8 → "8:00 AM"
 * 14 → "2:00 PM"
 */
function formatHourDisplay(hour: i32): string {
  let displayHour = hour;
  if (displayHour >= 24) displayHour -= 24;
  
  const isPM = displayHour >= 12;
  if (displayHour == 0) displayHour = 12;
  else if (displayHour > 12) displayHour -= 12;
  
  // Build hour string manually (no toString!)
  let hourStr: string;
  if (displayHour < 10) {
    hourStr = String.fromCharCode(48 + displayHour);
  } else if (displayHour >= 10 && displayHour < 20) {
    hourStr = '1' + String.fromCharCode(48 + (displayHour - 10));
  } else {
    hourStr = '2' + String.fromCharCode(48 + (displayHour - 20));
  }
  
  const period = isPM ? ' PM' : ' AM';
  return hourStr + ':00' + period;
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
  
  // Convert Set to Array - manually without iterators (avoids managed objects!)
  const hoursArray: i32[] = [];
  // We need to iterate through all possible hours and check if they're in the set
  for (let hour = 0; hour <= 27; hour++) {  // GTFS allows times up to 27:xx (next day)
    if (hoursSet.has(hour)) {
      hoursArray.push(hour);
    }
  }
  
  // Hours are already sorted since we iterate 0-27
  
  // Build HTML document using Array<string> for efficiency
  const htmlParts: string[] = [];
  
  htmlParts.push('<!DOCTYPE html>\n<html lang="en">\n<head>\n');
  htmlParts.push('  <meta charset="UTF-8">\n');
  htmlParts.push('  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n');
  htmlParts.push('  <title>');
  htmlParts.push(stopName);
  htmlParts.push('</title>\n</head>\n<body>\n');
  
  // Build stop header
  htmlParts.push(StopHeader(stopName, stopId, parentStopId, parentStopName, agencyName));
  
  // Build terminals list if there are any
  if (childStopIds.length > 0) {
    htmlParts.push(TerminalsList(agencyName, stopId, childStopIds, childStopNames));
  }
  
  // Build routes section header (only if there are routes)
  if (hoursArray.length > 0) {
    htmlParts.push('<h2>Routes at ');
    htmlParts.push(stopName);
    htmlParts.push('</h2>\n');
  }
  
  // Build schedule for each hour
  for (let h = 0; h < hoursArray.length; h++) {
    const hour = hoursArray[h];
    const hourDisplay = formatHourDisplay(hour);
    
    htmlParts.push(HourHeader(hourDisplay));
    htmlParts.push(ScheduleListStart());
    
    // Get entries for this hour, sorted by time
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
      
      // Lookup trip, route, and calendar (with null checks!)
      if (!tripMap.has(tripId)) continue;
      const tripInfo = tripMap.get(tripId);
      
      const routeId = tripInfo[0];
      const serviceId = tripInfo[1];
      const headsign = tripInfo[2];
      
      let routeName = 'Unknown';
      if (routeMap.has(routeId)) {
        const routeInfo = routeMap.get(routeId);
        routeName = routeInfo[0].length > 0 ? routeInfo[0] : routeInfo[1];
      }
      
      let serviceDays = '';
      if (calendarMap.has(serviceId)) {
        const calendarInfo = calendarMap.get(serviceId);
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
      
      htmlParts.push(ScheduleEntry(formattedTime, datetime, routeName, headsign, serviceDays));
    }
    
    htmlParts.push(ScheduleListEnd());
  }
  
  // Close HTML document
  htmlParts.push('</body>\n</html>');
  
  return htmlParts.join('');
}
