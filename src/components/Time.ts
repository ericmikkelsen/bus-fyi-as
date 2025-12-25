// Time Component
// Formats and wraps a GTFS time string
// Using as-bind for proper WASM memory management

/**
 * Formats a GTFS time string (HH:MM:SS) to a readable format and wraps it in a <time> element
 * @param gtfsTime - Time in GTFS format (HH:MM:SS, can be > 24 for times past midnight)
 * @returns HTML time element with formatted time
 */
export function Time(gtfsTime: string): string {
  if (!gtfsTime || gtfsTime.length === 0) {
    return '<time>--:--</time>';
  }
  
  // Parse time manually to avoid unreachable errors
  const colonIndex = gtfsTime.indexOf(':');
  if (colonIndex < 0) {
    return '<time>' + gtfsTime + '</time>';
  }
  
  // Extract hour manually (character by character)
  let hour = 0;
  for (let i = 0; i < colonIndex; i++) {
    const charCode = gtfsTime.charCodeAt(i);
    if (charCode >= 48 && charCode <= 57) { // '0' to '9'
      hour = hour * 10 + (charCode - 48);
    }
  }
  
  // Find second colon for minutes
  let secondColonIndex = -1;
  for (let i = colonIndex + 1; i < gtfsTime.length; i++) {
    if (gtfsTime.charAt(i) === ':') {
      secondColonIndex = i;
      break;
    }
  }
  
  // Extract minute string
  const minuteStr = secondColonIndex > 0 
    ? gtfsTime.substring(colonIndex + 1, secondColonIndex)
    : gtfsTime.substring(colonIndex + 1);
  
  // Parse minutes manually
  let minute = 0;
  for (let i = 0; i < minuteStr.length; i++) {
    const charCode = minuteStr.charCodeAt(i);
    if (charCode >= 48 && charCode <= 57) {
      minute = minute * 10 + (charCode - 48);
    }
  }
  
  // Determine AM/PM
  let displayHour = hour;
  let period = 'AM';
  
  if (hour >= 24) {
    // Handle times past midnight (25:00 = 1:00 AM next day)
    displayHour = hour - 24;
  }
  
  if (displayHour >= 12) {
    period = 'PM';
    if (displayHour > 12) {
      displayHour = displayHour - 12;
    }
  }
  
  if (displayHour === 0) {
    displayHour = 12;
  }
  
  // Format minute with leading zero if needed
  let minuteFormatted = '';
  if (minute < 10) {
    minuteFormatted = '0' + minute.toString();
  } else {
    minuteFormatted = minute.toString();
  }
  
  // Build datetime attribute (ISO 8601 format for time element)
  let isoHour = hour;
  if (isoHour >= 24) {
    isoHour = isoHour - 24;
  }
  let isoHourStr = '';
  if (isoHour < 10) {
    isoHourStr = '0' + isoHour.toString();
  } else {
    isoHourStr = isoHour.toString();
  }
  
  const datetime = isoHourStr + ':' + minuteFormatted;
  
  return '<time datetime="' + datetime + '">' + displayHour.toString() + ':' + minuteFormatted + ' ' + period + '</time>';
}
