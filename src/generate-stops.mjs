// Maximum Performance Generator - Uses streaming for large files + AssemblyScript
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { cpus } from 'os';
import { getAgencies } from './modules/gtfs-parser-fast.mjs';
import { streamParseStopTimes, streamParseGTFS, getLineCount } from './modules/streaming-gtfs-parser.mjs';

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
  
  // Build schedule content in JavaScript to avoid WASM memory management issues
  const scheduleContentParts = [];
  
  for (let i = 0; i < hours.length; i++) {
    const hour = hours[i];
    
    // Use WASM to filter stop times for this hour
    const indicesForHour = wasmModule.filterStopTimesByHour(arrivalTimes, hour);
    const sortedIndices = wasmModule.sortByArrivalTime(indicesForHour, arrivalTimes);
    
    // Get hour header and list start from WASM
    scheduleContentParts.push(wasmModule.getScheduleHourStart(hour));
    
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
      
      // Get entry HTML from WASM and add to parts array
      scheduleContentParts.push(wasmModule.getScheduleEntry(time, routeName, headsign));
    }
    
    // Close the hour block
    scheduleContentParts.push(wasmModule.getScheduleHourEnd());
  }
  
  // Join all parts in JavaScript to avoid repeated WASM string concatenation
  const scheduleContent = scheduleContentParts.join('');
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
 * Format elapsed time for logging
 */
function formatTime(ms) {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}m ${secs}s`;
}

/**
 * Log progress for long-running loops
 */
function logProgress(current, total, label, startTime) {
  const percent = ((current / total) * 100).toFixed(1);
  const elapsed = Date.now() - startTime;
  const rate = current / (elapsed / 1000);
  const eta = ((total - current) / rate) * 1000;
  
  console.log(`    ${label}: ${current}/${total} (${percent}%) - ${rate.toFixed(0)}/sec - ETA: ${formatTime(eta)}`);
}

/**
 * Generate stop pages with maximum WASM usage
 */
async function generateStopPages() {
  console.log('🚀 Maximum Performance Generator (WASM-powered)');
  console.log(`💪 Using ${NUM_WORKERS} CPU cores + AssemblyScript`);
  
  // Load WASM module
  console.log('⚡ Loading AssemblyScript module...');
  const wasmLoadStart = Date.now();
  const wasmModule = await import(join(rootDir, 'dist', 'release.js'));
  console.log(`  ✓ WASM loaded in ${((Date.now() - wasmLoadStart) / 1000).toFixed(2)}s`);
  
  const dataDir = join(rootDir, 'data');
  const distDir = join(rootDir, 'dist');
  
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }
  
  const agencies = getAgencies(dataDir);
  
  if (agencies.length === 0) {
    console.log('⚠ No agencies found. Run `npm run download:gtfs` to download CTA data.');
    return;
  }
  
  console.log(`📊 Found ${agencies.length} ${agencies.length === 1 ? 'agency' : 'agencies'}: ${agencies.join(', ')}`);
  
  let totalStops = 0;
  const startTime = Date.now();
  
  for (const agency of agencies) {
    const agencyPath = join(dataDir, agency);
    console.log(`\n📍 Processing ${agency}...`);
    
    const parseStart = Date.now();
    
    // Parse smaller files using WASM (fast and efficient)
    console.log('  🔧 Parsing CSV files...');
    const csvParseStart = Date.now();
    
    const stopsContent = loadCSVForWASM(join(agencyPath, 'stops.txt'));
    const stops = parseCSVWithWASM(stopsContent, wasmModule);
    console.log(`    ✓ stops.txt (${stops.length} rows) - ${((Date.now() - csvParseStart) / 1000).toFixed(2)}s`);
    
    const routesParseStart = Date.now();
    const routesContent = loadCSVForWASM(join(agencyPath, 'routes.txt'));
    const routes = parseCSVWithWASM(routesContent, wasmModule);
    console.log(`    ✓ routes.txt (${routes.length} rows) - ${((Date.now() - routesParseStart) / 1000).toFixed(2)}s`);
    
    const tripsParseStart = Date.now();
    const tripsContent = loadCSVForWASM(join(agencyPath, 'trips.txt'));
    const trips = parseCSVWithWASM(tripsContent, wasmModule);
    console.log(`    ✓ trips.txt (${trips.length} rows) - ${((Date.now() - tripsParseStart) / 1000).toFixed(2)}s`);
    
    const calendarParseStart = Date.now();
    const calendarContent = loadCSVForWASM(join(agencyPath, 'calendar.txt'));
    const calendar = parseCSVWithWASM(calendarContent, wasmModule);
    console.log(`    ✓ calendar.txt (${calendar.length} rows) - ${((Date.now() - calendarParseStart) / 1000).toFixed(2)}s`);
    
    // Stream parse stop_times.txt (can be 300MB+, millions of rows)
    // This approach doesn't load the entire file into memory
    console.log('  🌊 Streaming stop_times.txt (large file)...');
    const stopTimesFile = join(agencyPath, 'stop_times.txt');
    const stopTimesLineCount = await getLineCount(stopTimesFile);
    console.log(`    Expected ~${stopTimesLineCount.toLocaleString()} lines`);
    
    const stopTimesParseStart = Date.now();
    let lastProgressTime = Date.now();
    const stopTimesMap = await streamParseStopTimes(stopTimesFile, (processed, total) => {
      const now = Date.now();
      if (now - lastProgressTime >= 5000) { // Progress every 5 seconds
        const percent = ((processed / total) * 100).toFixed(1);
        const rate = processed / ((now - stopTimesParseStart) / 1000);
        const eta = ((total - processed) / rate) * 1000;
        console.log(`    Processing: ${processed.toLocaleString()}/${total.toLocaleString()} (${percent}%) - ${rate.toFixed(0)}/sec - ETA: ${formatTime(eta)}`);
        lastProgressTime = now;
      }
    });
    
    const stopTimesCount = Object.values(stopTimesMap).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`    ✓ stop_times.txt (${stopTimesCount.toLocaleString()} rows indexed by stop) - ${((Date.now() - stopTimesParseStart) / 1000).toFixed(2)}s`);
    
    const parseTime = ((Date.now() - parseStart) / 1000).toFixed(2);
    
    if (stops.length === 0) {
      console.log('  ⚠ No stops found');
      continue;
    }
    
    console.log(`  ✅ All CSV parsed in ${((Date.now() - parseStart) / 1000).toFixed(2)}s`);
    
    // Build parent-child relationships
    console.log('  🔗 Building stop relationships...');
    const indexStart = Date.now();
    
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
    console.log(`  ✓ Relationships built in ${indexTime}s`);
    console.log(`  💾 Memory: stop_times indexed by ${Object.keys(stopTimesMap).length} stops`);
    
    // Process stops
    console.log(`  🔧 Generating pages with WASM...`);
    const genStart = Date.now();
    
    const promises = [];
    const stopsToProcess = [];
    
    for (const stop of stops) {
      const stopTimesForStop = stopTimesMap[stop.stop_id] || [];
      const childStops = (childrenMap[stop.stop_id] || []).map(c => ({ id: c.stop_id, name: c.stop_name }));
      const parentStop = parentMap[stop.stop_id];
      
      if (stopTimesForStop.length === 0 && childStops.length === 0 && !parentStop) {
        continue;
      }
      
      stopsToProcess.push({
        stop,
        stopTimesForStop,
        childStops,
        parentStop
      });
    }
    
    console.log(`  📄 Processing ${stopsToProcess.length} stops...`);
    
    let lastLog = Date.now();
    const processStartTime = Date.now();
    for (let i = 0; i < stopsToProcess.length; i++) {
      const { stop, stopTimesForStop, childStops, parentStop } = stopsToProcess[i];
      
      // Progress logging every 60 seconds
      if (Date.now() - lastLog > 60000) {
        logProgress(i + 1, stopsToProcess.length, 'Generating pages', processStartTime);
        lastLog = Date.now();
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
      
      // Log progress every 60 seconds for large datasets
      if (stopsToProcess.length > 1000 && Date.now() - lastLog > 60000) {
        logProgress(i + 1, stopsToProcess.length, 'Generating pages', genStart);
        lastLog = Date.now();
      }
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
