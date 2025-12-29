// GTFS Parser for Node.js
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Parse a GTFS CSV file into an array of objects
 */
export function parseGTFSFile(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(',').map(h => h.trim());
  const records = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const record = {};
    
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = values[j] || '';
    }
    
    records.push(record);
  }
  
  return records;
}

/**
 * Parse a CSV line handling quoted values
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current.trim());
  return values;
}

/**
 * Load all GTFS data for an agency
 */
export function loadGTFSData(agencyPath) {
  return {
    stops: parseGTFSFile(join(agencyPath, 'stops.txt')),
    routes: parseGTFSFile(join(agencyPath, 'routes.txt')),
    trips: parseGTFSFile(join(agencyPath, 'trips.txt')),
    stopTimes: parseGTFSFile(join(agencyPath, 'stop_times.txt')),
    calendar: parseGTFSFile(join(agencyPath, 'calendar.txt')),
    agency: parseGTFSFile(join(agencyPath, 'agency.txt'))
  };
}

/**
 * Get all agencies in the data directory
 */
export function getAgencies(dataDir) {
  if (!existsSync(dataDir)) {
    return [];
  }
  
  const entries = readdirSync(dataDir, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
}

/**
 * Format time from GTFS format (HH:MM:SS) to a readable format
 */
export function formatTime(gtfsTime) {
  if (!gtfsTime) return '';
  
  const parts = gtfsTime.split(':');
  if (parts.length < 2) return gtfsTime;
  
  let hours = parseInt(parts[0]);
  const minutes = parts[1];
  
  // Handle times >= 24:00:00 (next day service)
  if (hours >= 24) {
    hours = hours - 24;
  }
  
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours);
  
  return `${displayHours}:${minutes} ${period}`;
}

/**
 * Get hour from GTFS time (0-23, can be >= 24 for next day)
 */
export function getHourFromTime(gtfsTime) {
  if (!gtfsTime) return 0;
  const parts = gtfsTime.split(':');
  return parseInt(parts[0]);
}

/**
 * Group stop times by hour
 */
export function groupStopTimesByHour(stopTimes) {
  const grouped = {};
  
  for (const stopTime of stopTimes) {
    const hour = getHourFromTime(stopTime.arrival_time);
    if (!grouped[hour]) {
      grouped[hour] = [];
    }
    grouped[hour].push(stopTime);
  }
  
  return grouped;
}

/**
 * Get service days from calendar entry
 */
export function getServiceDays(calendarEntry) {
  const days = [];
  if (calendarEntry.monday === '1') days.push('Mon');
  if (calendarEntry.tuesday === '1') days.push('Tue');
  if (calendarEntry.wednesday === '1') days.push('Wed');
  if (calendarEntry.thursday === '1') days.push('Thu');
  if (calendarEntry.friday === '1') days.push('Fri');
  if (calendarEntry.saturday === '1') days.push('Sat');
  if (calendarEntry.sunday === '1') days.push('Sun');
  return days;
}
