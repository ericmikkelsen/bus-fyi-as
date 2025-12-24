// The entry file of your WebAssembly module.

export function add(a: i32, b: i32): i32 {
  return a + b;
}

// Export GTFS utilities
export { Stop, Route, calculateDistance } from './gtfs';

// Export HTML generation utilities (legacy)
export {
  generateHeader,
  generateFooter,
  generatePage,
  generateList,
  generateCard
} from './html-generator';

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
  addScheduleHour,
  addScheduleEntry,
  closeScheduleHour,
  wrapInLayout
} from '../../pages/StopPage';

