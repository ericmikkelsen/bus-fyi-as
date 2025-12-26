// BatchStopProcessor
// Processes MULTIPLE stops at once and returns concatenated HTML with delimiters
// JavaScript streams the results to individual files
// This avoids sending massive CSVs to WASM - instead sends many small stop CSVs

import { processStopAndGenerateHTML } from './StopPageProcessor';

/**
 * HTML delimiter used to separate individual stop pages
 * Must be unique and not appear in HTML content
 */
const HTML_DELIMITER = '\n<!--STOP_SEPARATOR-->\n';

/**
 * Process multiple stops in batch and return concatenated HTML
 * 
 * @param stopData Array of stop data: [stopName, stopId, parentId, parentName, agencyName, childIds, childNames, stopTimesCsv]
 * @param tripsCsv Trips CSV (shared across all stops)
 * @param routesCsv Routes CSV (shared across all stops)
 * @param calendarCsv Calendar CSV (shared across all stops)
 * @returns Concatenated HTML with delimiters
 */
export function processBatchStops(
  stopNames: string[],
  stopIds: string[],
  parentIds: string[],
  parentNames: string[],
  agencyNames: string[],
  childIdsCSVArray: string[],  // Array of comma-separated strings!
  childNamesCSVArray: string[],  // Array of comma-separated strings!
  stopTimesCsvArray: string[],
  tripsCsv: string,
  routesCsv: string,
  calendarCsv: string
): string {
  const resultParts: string[] = [];  // Use array instead of concatenation!
  
  const numStops = stopNames.length;
  
  for (let i = 0; i < numStops; i++) {
    const html = processStopAndGenerateHTML(
      stopNames[i],
      stopIds[i],
      parentIds[i],
      parentNames[i],
      agencyNames[i],
      childIdsCSVArray[i],  // Already comma-separated
      childNamesCSVArray[i],  // Already comma-separated
      stopTimesCsvArray[i],
      tripsCsv,
      routesCsv,
      calendarCsv
    );
    
    resultParts.push(html);
    
    // Add delimiter between stops (but not after the last one)
    if (i < numStops - 1) {
      resultParts.push(HTML_DELIMITER);
    }
  }
  
  return resultParts.join('');
}

/**
 * Get the delimiter used to separate HTML pages
 */
export function getHtmlDelimiter(): string {
  return HTML_DELIMITER;
}
