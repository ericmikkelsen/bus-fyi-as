// The entry file of your WebAssembly module.

export function add(a: i32, b: i32): i32 {
  return a + b;
}

// Export GTFS utilities
// Note: Stop and Route classes removed as they cannot be exported from WASM
// Use plain objects instead if needed
export { calculateDistance } from './gtfs';

// Export HTML generation utilities (legacy)
export {
  generateHeader,
  generateFooter,
  generatePage,
  generateList,
  generateCard
} from './html-generator';

// CSV parsing moved to JavaScript to avoid WASM string memory pressure
// The parseCSV function in AssemblyScript creates too many temporary string objects
// when processing even small CSV files (100-200 rows), causing "unreachable" errors.
// JavaScript handles strings natively without reference counting, so it's more efficient
// for string-heavy operations like CSV parsing.

// Export data processing (parent-child, time grouping, etc.)
export {
  buildParentChildMap,
  getHourFromTime,
  groupStopTimesByHour,
  filterStopTimesByHour,
  formatTimeReadable,
  getServiceDaysString,
  sortByArrivalTime
} from './data-processing';

// Export simple components (return small HTML strings <200 bytes - no ESM bindings issues)
export { StopHeader } from '../../components/StopHeader';
export { TerminalsList } from '../../components/TerminalsList';
export { HourHeader } from '../../components/HourHeader';
export { Time } from '../../components/Time';

// Export layouts
export { BaseLayout } from '../../layouts/BaseLayout';

// Export pages
export {
  buildStopPageHTML
} from '../../pages/StopPage';

// Export main processor (JavaScript only reads/writes files, WASM does ALL processing)
export {
  processStopAndGenerateHTML
} from '../../pages/StopPageProcessor';

// Export batch processor (processes multiple stops at once and returns concatenated HTML)
export {
  processBatchStops,
  getHtmlDelimiter
} from '../../pages/BatchStopProcessor';

// Export chunked processor (returns HTML in small chunks to avoid ESM bindings refcount issues)
export {
  getStopHeaderChunk,
  getHourScheduleChunk,
  getScheduleHours,
  getDocumentFooter
} from '../../pages/StopPageProcessorChunked';

