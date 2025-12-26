// Simple test of Rust WASM module
import { generate_stop_page } from './pkg/bus_fyi_wasm.js';

console.log('Testing Rust WASM module...\n');

// Test data
const stopId = 'S001';
const stopName = 'Main Street Station';
const parentId = '';
const parentName = '';
const childStopsJson = JSON.stringify([
  { id: 'S001A', name: 'Main Street Station - Platform A' },
  { id: 'S001B', name: 'Main Street Station - Platform B' }
]);

const stopTimesCsv = `trip_id,arrival_time,departure_time,stop_id,stop_sequence
T001,08:00:00,08:00:00,S001,1
T002,08:30:00,08:30:00,S001,1
T003,09:00:00,09:00:00,S001,1`;

const routesCsv = `route_id,route_short_name,route_long_name
R1,1,North Line
R2,2,South Line`;

const tripsCsv = `route_id,service_id,trip_id,trip_headsign
R1,SRV1,T001,To North Terminal
R1,SRV1,T002,To North Terminal
R2,SRV2,T003,To South Terminal`;

const calendarCsv = `service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday
SRV1,1,1,1,1,1,0,0
SRV2,0,0,0,0,0,1,1`;

try {
  const html = generate_stop_page(
    stopId,
    stopName,
    parentId,
    parentName,
    childStopsJson,
    stopTimesCsv,
    routesCsv,
    tripsCsv,
    calendarCsv
  );
  
  console.log('✅ Rust WASM module executed successfully!');
  console.log(`✅ Generated HTML length: ${html.length} characters`);
  console.log(`\nFirst 500 characters of generated HTML:`);
  console.log(html.substring(0, 500));
  console.log('\n✅ Test passed!');
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
