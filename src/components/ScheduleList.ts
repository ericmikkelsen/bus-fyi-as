// ScheduleList Component
// Generates schedule entries for a specific hour
// Using as-bind for proper WASM memory management

import { Time } from './Time';

/**
 * Generates hour header
 * Takes a pre-formatted hour string (formatted in JavaScript)
 * @param hourDisplay - Pre-formatted hour display (e.g., "9:00 AM")
 */
export function HourHeader(hourDisplay: string): string {
  return '<h3>' + hourDisplay + '</h3>';
}

/**
 * Generates a single schedule entry with Time component
 * Takes PRE-FORMATTED time strings (formatted in JavaScript)
 * @param formattedTime - Pre-formatted time (e.g., "9:00 AM")
 * @param datetime - HTML5 datetime attribute (e.g., "09:00")
 * @param routeName - Route name/number
 * @param headsign - Route destination
 * @param serviceDays - Comma-separated service days
 */
export function ScheduleEntry(formattedTime: string, datetime: string, routeName: string, headsign: string, serviceDays: string): string {
  if (formattedTime === '') return '';
  
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
