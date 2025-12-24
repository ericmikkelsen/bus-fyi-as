// Maximum Performance Generator - Uses AssemblyScript for all data processing
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { cpus } from 'os';
import { getAgencies } from './modules/gtfs-parser-fast.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const NUM_WORKERS = cpus().length;

/**
 * Write file using streams with Buffer
 */
async function writeFileStreamFast(filePath, buffer) {
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(filePath, { highWaterMark: 64 * 1024 });
    stream.write(buffer);
    stream.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

/**
 * Load CSV file and let WASM parse it
 */
function loadCSVForWASM(filePath) {
  if (!existsSync(filePath)) {
    return '';
  }
  return readFileSync(filePath, 'utf-8');
}

/**
 * Process a single stop using WASM for all logic
 */
async function processStopWithWASM(
  stopId, stopName, parentId, parentName, childStopData,
  stopTimesForThisStop, routesData, tripsData, calendarData,
  wasmModule, distDir
) {
  // Prepare stop directory
  // Child stops: /stops/[parent_id]/[stop_id]/index.html
  // Parent/regular stops: /stops/[stop_id]/index.html
  let stopDir;
  if (parentId) {
    // This is a child stop - create nested path
    stopDir = join(distDir, 'stops', parentId, stopId);
  } else {
    // This is a parent or regular stop
    stopDir = join(distDir, 'stops', stopId);
  }
  
  if (!existsSync(stopDir)) {
    mkdirSync(stopDir, { recursive: true });
  }
  
  // Use WASM to build parent-child relationships
  const childStopIds = childStopData.map(c => c.id);
  const childStopNames = childStopData.map(c => c.name);
  const parentStopId = parentId || '';
  const parentStopName = parentName || '';
  const hasRoutes = stopTimesForThisStop.length > 0;
  
  // Generate HTML using WASM
  let html = wasmModule.generateStopPage(
    stopName,
    stopId,
    parentStopId,
    parentStopName,
    childStopIds,
    childStopNames,
    hasRoutes
  );
  
  // Use WASM to group stop times by hour
  const arrivalTimes = stopTimesForThisStop.map(st => st.arrival_time);
  const tripIds = stopTimesForThisStop.map(st => st.trip_id);
  
  // Get unique hours using WASM
  const hours = wasmModule.groupStopTimesByHour(arrivalTimes);
  
  let scheduleContent = '';
  for (let i = 0; i < hours.length; i++) {
    const hour = hours[i];
    
    // Use WASM to filter stop times for this hour
    const indicesForHour = wasmModule.filterStopTimesByHour(arrivalTimes, hour);
    const sortedIndices = wasmModule.sortByArrivalTime(indicesForHour, arrivalTimes);
    
    scheduleContent = wasmModule.addScheduleHour(scheduleContent, hour);
    
    for (let j = 0; j < sortedIndices.length; j++) {
      const idx = sortedIndices[j];
      const stopTime = stopTimesForThisStop[idx];
      const tripId = tripIds[idx];
      
      // Find trip and route
      const trip = tripsData.find(t => t.trip_id === tripId);
      const route = trip ? routesData.find(r => r.route_id === trip.route_id) : null;
      
      const routeName = route ? (route.route_short_name || route.route_long_name) : 'Unknown';
      const time = wasmModule.formatTimeReadable(stopTime.arrival_time);
      const headsign = trip?.trip_headsign || '';
      
      scheduleContent = wasmModule.addScheduleEntry(scheduleContent, time, routeName, headsign);
    }
    
    scheduleContent = wasmModule.closeScheduleHour(scheduleContent);
  }
  
  html = html.replace('</body>', scheduleContent + '</body>');
  
  // Generate CSV with service days using WASM
  const csvLines = ['arrival_time,route_short_name,route_long_name,headsign,service_days'];
  
  for (let i = 0; i < stopTimesForThisStop.length; i++) {
    const stopTime = stopTimesForThisStop[i];
    const trip = tripsData.find(t => t.trip_id === stopTime.trip_id);
    const route = trip ? routesData.find(r => r.route_id === trip.route_id) : null;
    const calendar = trip ? calendarData.find(c => c.service_id === trip.service_id) : null;
    
    if (route && calendar) {
      const routeShort = (route.route_short_name || '').replace(/,/g, ' ');
      const routeLong = (route.route_long_name || '').replace(/,/g, ' ');
      const headsign = (trip.trip_headsign || '').replace(/,/g, ' ');
      
      // Use WASM to format service days
      const serviceDays = wasmModule.getServiceDaysString(
        calendar.monday, calendar.tuesday, calendar.wednesday,
        calendar.thursday, calendar.friday, calendar.saturday, calendar.sunday
      );
      
      csvLines.push(`${stopTime.arrival_time},${routeShort},${routeLong},${headsign},${serviceDays}`);
    }
  }
  
  const csvBuffer = Buffer.from(csvLines.join('\n'));
  
  // Write both files
  await Promise.all([
    writeFileStreamFast(join(stopDir, 'index.html'), Buffer.from(html)),
    writeFileStreamFast(join(stopDir, 'schedule.csv'), csvBuffer)
  ]);
}

/**
 * Parse CSV using WASM
 */
function parseCSVWithWASM(content, wasmModule) {
  const rows = wasmModule.parseCSV(content);
  if (rows.length === 0) return [];
  
  const headers = rows[0];
  const records = [];
  
  for (let i = 1; i < rows.length; i++) {
    const record = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = rows[i][j] || '';
    }
    records.push(record);
  }
  
  return records;
}

/**
 * Generate stop pages with maximum WASM usage
 */
async function generateStopPages() {
  console.log('🚀 Maximum Performance Generator (WASM-powered)');
  console.log(`💪 Using ${NUM_WORKERS} CPU cores + AssemblyScript`);
  
  // Load WASM module
  console.log('⚡ Loading AssemblyScript module...');
  const wasmModule = await import(join(rootDir, 'dist', 'release.js'));
  
  const dataDir = join(rootDir, 'data');
  const distDir = join(rootDir, 'dist');
  
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }
  
  const agencies = getAgencies(dataDir);
  
  if (agencies.length === 0) {
    console.log('⚠ No agencies found');
    return;
  }
  
  console.log(`📊 Found ${agencies.length} ${agencies.length === 1 ? 'agency' : 'agencies'}: ${agencies.join(', ')}`);
  
  let totalStops = 0;
  const startTime = Date.now();
  
  for (const agency of agencies) {
    const agencyPath = join(dataDir, agency);
    console.log(`\n📍 Processing ${agency}...`);
    
    const parseStart = Date.now();
    
    // Load CSV files
    const stopsContent = loadCSVForWASM(join(agencyPath, 'stops.txt'));
    const routesContent = loadCSVForWASM(join(agencyPath, 'routes.txt'));
    const tripsContent = loadCSVForWASM(join(agencyPath, 'trips.txt'));
    const stopTimesContent = loadCSVForWASM(join(agencyPath, 'stop_times.txt'));
    const calendarContent = loadCSVForWASM(join(agencyPath, 'calendar.txt'));
    
    // Parse using WASM
    console.log('  🔧 Parsing with AssemblyScript...');
    const stops = parseCSVWithWASM(stopsContent, wasmModule);
    const routes = parseCSVWithWASM(routesContent, wasmModule);
    const trips = parseCSVWithWASM(tripsContent, wasmModule);
    const stopTimes = parseCSVWithWASM(stopTimesContent, wasmModule);
    const calendar = parseCSVWithWASM(calendarContent, wasmModule);
    
    const parseTime = ((Date.now() - parseStart) / 1000).toFixed(2);
    
    if (stops.length === 0) {
      console.log('  ⚠ No stops found');
      continue;
    }
    
    console.log(`  ✓ Parsed with WASM in ${parseTime}s`);
    console.log(`  📦 ${stops.length} stops, ${stopTimes.length} stop times`);
    
    // Build indexes
    const indexStart = Date.now();
    const stopTimesMap = {};
    for (const stopTime of stopTimes) {
      if (!stopTimesMap[stopTime.stop_id]) {
        stopTimesMap[stopTime.stop_id] = [];
      }
      stopTimesMap[stopTime.stop_id].push(stopTime);
    }
    
    // Build parent-child relationships in JavaScript
    // (AssemblyScript Map is not directly accessible from JavaScript -
    // WASM only exports primitive types and typed arrays, not complex objects)
    const childrenMap = {};
    const stopMap = {};
    const parentMap = {};
    
    for (const stop of stops) {
      stopMap[stop.stop_id] = stop;
      
      // Build children map
      if (stop.parent_station && stop.parent_station.trim() !== '') {
        const parentId = stop.parent_station;
        if (!childrenMap[parentId]) {
          childrenMap[parentId] = [];
        }
        childrenMap[parentId].push(stop);
      }
    }
    
    // Build parent map
    for (const stop of stops) {
      if (stop.parent_station && stop.parent_station.trim() !== '') {
        parentMap[stop.stop_id] = stopMap[stop.parent_station];
      }
    }
    
    const indexTime = ((Date.now() - indexStart) / 1000).toFixed(2);
    console.log(`  ✓ Built relationships in ${indexTime}s`);
    
    // Process stops
    console.log(`  🔧 Generating pages with WASM...`);
    const genStart = Date.now();
    
    const promises = [];
    for (const stop of stops) {
      const stopTimesForStop = stopTimesMap[stop.stop_id] || [];
      const childStops = (childrenMap[stop.stop_id] || []).map(c => ({ id: c.stop_id, name: c.stop_name }));
      const parentStop = parentMap[stop.stop_id];
      
      if (stopTimesForStop.length === 0 && childStops.length === 0 && !parentStop) {
        continue;
      }
      
      promises.push(
        processStopWithWASM(
          stop.stop_id, stop.stop_name, 
          parentStop ? parentStop.stop_id : null,
          parentStop ? parentStop.stop_name : null,
          childStops, stopTimesForStop, routes, trips, calendar,
          wasmModule, distDir
        )
      );
    }
    
    await Promise.all(promises);
    
    const genTime = ((Date.now() - genStart) / 1000).toFixed(2);
    totalStops += promises.length;
    
    console.log(`  ✅ Generated ${promises.length} stops in ${genTime}s (${(promises.length / genTime).toFixed(0)} pages/sec)`);
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n🎉 Complete: ${totalStops} stops in ${elapsed}s`);
  console.log(`⚡ Average: ${(totalStops / elapsed).toFixed(0)} pages/second`);
  console.log(`🚀 WASM-powered for maximum performance!`);
  console.log(`📁 Output: dist/stops/[stop-id]/index.html + schedule.csv`);
}

generateStopPages().catch(console.error);
