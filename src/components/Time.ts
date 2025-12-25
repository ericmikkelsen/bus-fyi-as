// Time Component
// Wraps a formatted time in a semantic HTML time element
// Time formatting should be done in JavaScript to avoid WASM string memory pressure

/**
 * Wraps a formatted time string in a <time> element with datetime attribute
 * @param formattedTime - Already formatted time string (e.g., "9:00 AM")
 * @param datetime - ISO 8601 time format for datetime attribute (e.g., "09:00")
 * @returns HTML time element
 */
export function Time(formattedTime: string, datetime: string): string {
  return '<time datetime="' + datetime + '">' + formattedTime + '</time>';
}
