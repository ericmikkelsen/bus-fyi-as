// HourHeader Component
// Generates an hour header for schedule grouping

/**
 * Generates an hour header (e.g., "6:00 AM", "2:00 PM")
 */
export function HourHeader(hour: i32): string {
  let hourDisplay: i32 = hour;
  let period: string = 'AM';
  
  if (hour >= 12) {
    period = 'PM';
    if (hour > 12) {
      hourDisplay = hour - 12;
    }
  }
  
  if (hour === 0) {
    hourDisplay = 12;
  }
  
  return '\n  <h3>' + hourDisplay.toString() + ':00 ' + period + '</h3>\n';
}
