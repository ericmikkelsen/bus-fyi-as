// Ultra-Optimized GTFS Parser with caching and fast CSV parsing
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Fast CSV parser using Buffer for better performance
 */
export function parseGTFSFileFast(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }

  const buffer = readFileSync(filePath);
  const content = buffer.toString('utf-8');
  
  // Split by newlines more efficiently
  const lines = [];
  let start = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      const line = content.slice(start, i).trim();
      if (line) lines.push(line);
      start = i + 1;
    }
  }
  const lastLine = content.slice(start).trim();
  if (lastLine) lines.push(lastLine);
  
  if (lines.length === 0) return [];
  
  // Parse header
  const headers = lines[0].split(',').map(h => h.trim());
  const headerCount = headers.length;
  const records = new Array(lines.length - 1);
  
  // Pre-allocate for better performance
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLineFast(lines[i], headerCount);
    const record = {};
    
    for (let j = 0; j < headerCount; j++) {
      record[headers[j]] = values[j] || '';
    }
    
    records[i - 1] = record;
  }
  
  return records;
}

/**
 * Faster CSV line parser with fewer allocations
 */
function parseCSVLineFast(line, expectedCount) {
  const values = new Array(expectedCount);
  let valueIndex = 0;
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values[valueIndex++] = current.trim();
      current = '';
    } else {
      current += char;
    }
  }
  
  values[valueIndex] = current.trim();
  return values;
}

/**
 * Original CSV parser (for compatibility)
 */
export function parseGTFSFile(filePath) {
  return parseGTFSFileFast(filePath);
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
 * Load all GTFS data for an agency with pre-built indexes
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
 * Load GTFS data with pre-built lookup maps for maximum performance
 */
export function loadGTFSDataWithIndexes(agencyPath) {
  const data = loadGTFSData(agencyPath);
  
  // Pre-build all lookup maps
  const tripMap = new Map();
  const tripToRouteMap = new Map();
  const tripToServiceMap = new Map();
  
  for (const trip of data.trips) {
    tripMap.set(trip.trip_id, trip);
    tripToRouteMap.set(trip.trip_id, trip.route_id);
    tripToServiceMap.set(trip.trip_id, trip.service_id);
  }
  
  const routeMap = new Map();
  for (const route of data.routes) {
    routeMap.set(route.route_id, route);
  }
  
  const serviceDaysMap = new Map();
  for (const cal of data.calendar) {
    const days = [];
    if (cal.monday === '1') days.push('Mon');
    if (cal.tuesday === '1') days.push('Tue');
    if (cal.wednesday === '1') days.push('Wed');
    if (cal.thursday === '1') days.push('Thu');
    if (cal.friday === '1') days.push('Fri');
    if (cal.saturday === '1') days.push('Sat');
    if (cal.sunday === '1') days.push('Sun');
    serviceDaysMap.set(cal.service_id, days.join(','));
  }
  
  return {
    ...data,
    // Indexes
    tripMap,
    tripToRouteMap,
    tripToServiceMap,
    routeMap,
    serviceDaysMap
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
