// ScheduleList Component
// Generates schedule entries for a specific hour
// Using as-bind for proper WASM memory management

/**
 * Formats time from GTFS format (HH:MM:SS) to readable format
 */
export function formatTime(gtfsTime: string): string {
  if (gtfsTime === '') return '';
  
  const parts = gtfsTime.split(':');
  if (parts.length < 2) return gtfsTime;
  
  let hours = I32.parseInt(parts[0]);
  const minutes = parts[1];
  
  // Handle times >= 24:00:00 (next day service)
  if (hours >= 24) {
    hours = hours - 24;
  }
  
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours);
  
  return displayHours.toString() + ':' + minutes + ' ' + period;
}

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
 * Generates a single schedule entry
 */
export function ScheduleEntry(time: string, routeName: string, headsign: string): string {
  let html = '    <li>' + time + ' - ' + routeName;
  if (headsign !== '') {
    html += ' to ' + headsign;
  }
  html += '</li>';
  return html;
}

/**
 * Generates ordered list wrapper
 */
export function ScheduleListStart(): string {
  return '<ol>';
}

export function ScheduleListEnd(): string {
  return '</ol>';
}
