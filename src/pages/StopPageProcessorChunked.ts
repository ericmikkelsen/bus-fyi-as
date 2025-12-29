// StopPageProcessorChunked
// Returns HTML in smaller chunks to avoid ESM bindings refcount issues
// JavaScript assembles the final document from chunks returned by WASM

import { HourHeader, ScheduleListStart, ScheduleListEnd, ScheduleEntry } from '../components/ScheduleList';
import { StopHeader } from '../components/StopHeader';
import { TerminalsList } from '../components/TerminalsList';

/**
 * Parse a single CSV line, handling quoted fields with commas
 * Using i32[] for character codes to avoid managed string objects
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  const fieldCodes: i32[] = [];
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const charCode = line.charCodeAt(i);
    
    if (charCode == 34) {  // '"' = 34
      inQuotes = !inQuotes;
    } else if (charCode == 44 && !inQuotes) {  // ',' = 44
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
 */
function parseCSV(content: string): string[][] {
  const result: string[][] = [];
  const lineCodes: i32[] = [];
  
  for (let i = 0; i < content.length; i++) {
    const charCode = content.charCodeAt(i);
    if (charCode == 10 || charCode == 13) {  // '\n' = 10, '\r' = 13
      if (lineCodes.length > 0) {
        result.push(parseCSVLine(String.fromCharCodes(lineCodes)));
        lineCodes.length = 0;
      }
    } else if (charCode != 13) {  // Skip '\r'
      lineCodes.push(charCode);
    }
  }
  
  if (lineCodes.length > 0) {
    result.push(parseCSVLine(String.fromCharCodes(lineCodes)));
  }
  
  return result;
}

/**
 * Extract hour from GTFS time string (handles 24:00+ times)
 */
function getHourFromTime(time: string): i32 {
  if (time.length < 2) return 0;
  
  const char0 = time.charCodeAt(0);
  const char1 = time.charCodeAt(1);
  
  // If second char is ':', it's single digit hour
  if (char1 == 58) {  // ':' = 58
    return char0 - 48;
  }
  
  // Two digit hour
  return (char0 - 48) * 10 + (char1 - 48);
}

/**
 * Format hour for display (e.g., 9 -> "9:00 AM", 13 -> "1:00 PM")
 */
function formatHourDisplay(hour: i32): string {
  let displayHour = hour % 12;
  if (displayHour == 0) displayHour = 12;
  
  let hourStr: string;
  if (displayHour < 10) {
    hourStr = String.fromCharCode(48 + displayHour);
  } else {
    hourStr = '1' + String.fromCharCode(48 + (displayHour - 10));
  }
  
  const ampm = hour < 12 || hour >= 24 ? ' AM' : ' PM';
  return hourStr + ':00' + ampm;
}

/**
 * Format GTFS time to readable time with datetime attribute
 */
function formatTime(gtfsTime: string): string {
  const hour = getHourFromTime(gtfsTime);
  let displayHour = hour % 12;
  if (displayHour == 0) displayHour = 12;
  
  const ampm = hour < 12 || hour >= 24 ? 'AM' : 'PM';
  const minutesPart = gtfsTime.length >= 5 ? gtfsTime.substring(3, 5) : '00';
  
  let hourStr: string;
  if (displayHour < 10) {
    hourStr = String.fromCharCode(48 + displayHour);
  } else {
    hourStr = '1' + String.fromCharCode(48 + (displayHour - 10));
  }
  
  return hourStr + ':' + minutesPart + ' ' + ampm;
}

/**
 * Get datetime attribute for time element
 */
function getDatetime(gtfsTime: string): string {
  if (gtfsTime.length >= 5) {
    // Convert to i32 array for manipulation
    const codes: i32[] = [];
    for (let i = 0; i < 5; i++) {
      codes.push(gtfsTime.charCodeAt(i));
    }
    return String.fromCharCodes(codes);
  }
  return gtfsTime;
}

/**
 * CHUNK 1: Process stop data and return HTML header + stop info
 * Returns small string (~500 bytes)
 */
export function getStopHeaderChunk(
  stopName: string,
  stopId: string,
  parentStopId: string,
  parentStopName: string,
  agencyName: string,
  childStopIdsCSV: string,
  childStopNamesCSV: string
): string {
  const htmlParts: string[] = [];
  
  // HTML document start
  htmlParts.push('<!DOCTYPE html>\n<html lang="en">\n<head>\n');
  htmlParts.push('  <meta charset="UTF-8">\n');
  htmlParts.push('  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n');
  htmlParts.push('  <title>');
  htmlParts.push(stopName);
  htmlParts.push('</title>\n</head>\n<body>\n');
  
  // Stop header
  htmlParts.push(StopHeader(stopName, stopId, parentStopId, parentStopName, agencyName));
  
  // Terminals list if present
  const childStopIds = childStopIdsCSV.length > 0 ? childStopIdsCSV.split(',') : [];
  const childStopNames = childStopNamesCSV.length > 0 ? childStopNamesCSV.split(',') : [];
  
  if (childStopIds.length > 0) {
    htmlParts.push(TerminalsList(agencyName, stopId, childStopIds, childStopNames));
  }
  
  // Routes section header
  htmlParts.push('<h2>Routes at ');
  htmlParts.push(stopName);
  htmlParts.push('</h2>\n');
  
  return htmlParts.join('');
}

/**
 * CHUNK 2: Process schedule data for a SINGLE hour and return HTML
 * Returns small string (~1-2KB per hour)
 */
export function getHourScheduleChunk(
  hour: i32,
  stopTimesCSV: string,
  tripCSV: string,
  routeCSV: string,
  calendarCSV: string
): string {
  // Parse CSVs in WASM
  const stopTimeRows = parseCSV(stopTimesCSV);
  const tripRows = parseCSV(tripCSV);
  const routeRows = parseCSV(routeCSV);
  const calendarRows = parseCSV(calendarCSV);
  
  // Build lookup maps
  const tripMap = new Map<string, string[]>();
  for (let i = 1; i < tripRows.length; i++) {
    const row = tripRows[i];
    if (row.length >= 4) {
      tripMap.set(row[0], [row[1], row[2], row[3]]);
    }
  }
  
  const routeMap = new Map<string, string[]>();
  for (let i = 1; i < routeRows.length; i++) {
    const row = routeRows[i];
    if (row.length >= 3) {
      routeMap.set(row[0], [row[1], row[2]]);
    }
  }
  
  const calendarMap = new Map<string, string[]>();
  for (let i = 1; i < calendarRows.length; i++) {
    const row = calendarRows[i];
    if (row.length >= 8) {
      calendarMap.set(row[0], [row[1], row[2], row[3], row[4], row[5], row[6], row[7]]);
    }
  }
  
  // Extract stop times for this hour
  const arrivalTimes: string[] = [];
  const tripIds: string[] = [];
  
  for (let i = 1; i < stopTimeRows.length; i++) {
    const row = stopTimeRows[i];
    if (row.length >= 3) {
      const time = row[1];
      if (getHourFromTime(time) == hour) {
        tripIds.push(row[0]);
        arrivalTimes.push(time);
      }
    }
  }
  
  if (arrivalTimes.length == 0) {
    return '';  // No entries for this hour
  }
  
  // Sort by time
  for (let i = 0; i < arrivalTimes.length - 1; i++) {
    for (let j = i + 1; j < arrivalTimes.length; j++) {
      if (arrivalTimes[i] > arrivalTimes[j]) {
        // Swap
        const tempTime = arrivalTimes[i];
        arrivalTimes[i] = arrivalTimes[j];
        arrivalTimes[j] = tempTime;
        
        const tempTrip = tripIds[i];
        tripIds[i] = tripIds[j];
        tripIds[j] = tempTrip;
      }
    }
  }
  
  // Build HTML for this hour
  const htmlParts: string[] = [];
  const hourDisplay = formatHourDisplay(hour);
  
  htmlParts.push(HourHeader(hourDisplay));
  htmlParts.push(ScheduleListStart());
  
  for (let i = 0; i < arrivalTimes.length; i++) {
    const arrivalTime = arrivalTimes[i];
    const tripId = tripIds[i];
    
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
      const dayParts: string[] = [];
      if (calendarInfo[0] == '1') dayParts.push('Mon');
      if (calendarInfo[1] == '1') dayParts.push('Tue');
      if (calendarInfo[2] == '1') dayParts.push('Wed');
      if (calendarInfo[3] == '1') dayParts.push('Thu');
      if (calendarInfo[4] == '1') dayParts.push('Fri');
      if (calendarInfo[5] == '1') dayParts.push('Sat');
      if (calendarInfo[6] == '1') dayParts.push('Sun');
      
      for (let d = 0; d < dayParts.length; d++) {
        if (d > 0) serviceDays += ',';
        serviceDays += dayParts[d];
      }
    }
    
    const formattedTime = formatTime(arrivalTime);
    const datetime = getDatetime(arrivalTime);
    
    htmlParts.push(ScheduleEntry(formattedTime, datetime, routeName, headsign, serviceDays));
  }
  
  htmlParts.push(ScheduleListEnd());
  
  return htmlParts.join('');
}

/**
 * CHUNK 3: Get list of hours that have schedule data
 * Returns small string (comma-separated numbers like "6,7,8,9")
 */
export function getScheduleHours(stopTimesCSV: string): string {
  const stopTimeRows = parseCSV(stopTimesCSV);
  
  const hoursSet = new Set<i32>();
  for (let i = 1; i < stopTimeRows.length; i++) {
    const row = stopTimeRows[i];
    if (row.length >= 2) {
      hoursSet.add(getHourFromTime(row[1]));
    }
  }
  
  const hoursArray: i32[] = [];
  for (let hour = 0; hour <= 27; hour++) {
    if (hoursSet.has(hour)) {
      hoursArray.push(hour);
    }
  }
  
  // Build comma-separated string manually
  let result = '';
  for (let i = 0; i < hoursArray.length; i++) {
    if (i > 0) result += ',';
    const hour = hoursArray[i];
    if (hour < 10) {
      result += String.fromCharCode(48 + hour);
    } else {
      result += String.fromCharCode(48 + (hour / 10)) + String.fromCharCode(48 + (hour % 10));
    }
  }
  
  return result;
}

/**
 * CHUNK 4: HTML document footer
 * Returns tiny string (~20 bytes)
 */
export function getDocumentFooter(): string {
  return '</body>\n</html>';
}
