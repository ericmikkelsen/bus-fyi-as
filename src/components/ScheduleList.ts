// ScheduleList Component
// Generates schedule entries for a specific hour
// Using as-bind for proper WASM memory management

import { Time } from './Time';

/**
 * Generates hour header
 */
export function HourHeader(hour: i32): string {
  let displayHour = hour;
  if (hour >= 24) {
    displayHour = hour - 24;
  }
  
  const period = displayHour >= 12 ? 'PM' : 'AM';
  const hourDisplay = displayHour === 0 ? 12 : (displayHour > 12 ? displayHour - 12 : displayHour);
  
  return '<h3>' + hourDisplay.toString() + ':00 ' + period + '</h3>';
}

/**
 * Generates a single schedule entry with Time component
 * Takes raw GTFS time and formats it internally using the Time component
 * @param gtfsTime - Raw GTFS time (e.g., "09:00:00")
 * @param routeName - Route name/number
 * @param headsign - Route destination
 * @param serviceDays - Comma-separated service days
 */
export function ScheduleEntry(gtfsTime: string, routeName: string, headsign: string, serviceDays: string): string {
  if (gtfsTime === '') return '';
  
  const parts = gtfsTime.split(':');
  if (parts.length < 2) return '';
  
  let hours = I32.parseInt(parts[0]);
  const minutes = parts[1];
  
  // Handle times >= 24:00:00 (next day service)
  if (hours >= 24) {
    hours = hours - 24;
  }
  
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours);
  
  const formattedTime = displayHours.toString() + ':' + minutes + ' ' + period;
  
  // Create datetime attribute (HH:MM format for HTML5)
  let datetimeHours = hours.toString();
  if (hours < 10) {
    datetimeHours = '0' + datetimeHours;
  }
  const datetime = datetimeHours + ':' + minutes;
  
  // Use Time component to wrap time in semantic HTML
  const timeHtml = Time(formattedTime, datetime);
  
  let html = '  <li>' + timeHtml + ' - ' + routeName;
  if (headsign !== '') {
    html += ' to ' + headsign;
  }
  if (serviceDays !== '') {
    html += ' ' + serviceDays;
  }
  html += '</li>\n';
  return html;
}

/**
 * Generates ordered list wrapper
 */
export function ScheduleListStart(): string {
  return '<ol>\n';
}

export function ScheduleListEnd(): string {
  return '</ol>\n';
}
