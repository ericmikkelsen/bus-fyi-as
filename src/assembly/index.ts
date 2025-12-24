// The entry file of your WebAssembly module.

export function add(a: i32, b: i32): i32 {
  return a + b;
}

// Export GTFS utilities
export { Stop, Route, calculateDistance } from './gtfs';

// Export HTML generation utilities
export {
  generateHeader,
  generateFooter,
  generatePage,
  generateList,
  generateCard
} from './html-generator';

