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

// Export CSV parsing (ultra-fast WASM parsing)
export {
  parseCSVLine,
  parseCSV,
  getColumnIndex,
  getColumn
} from './csv-parser';

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

// Export components
export { StopHeader } from '../../components/StopHeader';
export { TerminalsList } from '../../components/TerminalsList';
export { 
  formatTime,
  HourHeader, 
  ScheduleEntry,
  ScheduleListStart,
  ScheduleListEnd
} from '../../components/ScheduleList';

// Export layouts
export { BaseLayout } from '../../layouts/BaseLayout';

// Export pages
export {
  generateStopPage,
  getScheduleHourStart,
  getScheduleEntry,
  getScheduleHourEnd,
  wrapInLayout
} from '../../pages/StopPage';

