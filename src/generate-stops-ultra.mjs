// Ultra-Optimized Stop Pages Generator - Maximum Performance
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { cpus } from 'os';
import {
  loadGTFSDataWithIndexes,
  getAgencies,
  groupStopTimesByHour
} from './modules/gtfs-parser-fast.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const NUM_WORKERS = cpus().length; // Use all CPUs

/**
 * Generate CSV using Buffer for maximum performance
 */
function generateStopCSVFast(stop, stopTimes, indexes) {
  const { tripMap, tripToRouteMap, tripToServiceMap, routeMap, serviceDaysMap } = indexes;
  
  // Pre-allocate buffer size estimate
  const estimatedSize = stopTimes.length * 100 + 100;
  const parts = ['arrival_time,route_short_name,route_long_name,headsign,service_days\n'];
  
  // Sort once
  const sorted = [...stopTimes].sort((a, b) => a.arrival_time.localeCompare(b.arrival_time));
  
  for (const stopTime of sorted) {
    const tripId = stopTime.trip_id;
    const trip = tripMap.get(tripId);
    if (!trip) continue;
    
    const routeId = tripToRouteMap.get(tripId);
    const route = routeMap.get(routeId);
    if (!route) continue;
    
    const routeShort = (route.route_short_name || '').replace(/,/g, ' ');
    const routeLong = (route.route_long_name || '').replace(/,/g, ' ');
    const headsign = (trip.trip_headsign || '').replace(/,/g, ' ');
    const serviceDays = serviceDaysMap.get(tripToServiceMap.get(tripId)) || '';
    
    parts.push(`${stopTime.arrival_time},${routeShort},${routeLong},${headsign},${serviceDays}\n`);
  }
  
  return Buffer.from(parts.join(''));
}

/**
 * Write files using streams with Buffer for better performance
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
 * Process a single stop (optimized)
 */
async function processStop(stop, stopTimes, childStops, parentStop, wasmModule, indexes, distDir) {
  // Prepare stop directory
  // Child stops: /stops/[parent_id]/[stop_id]/index.html
  // Parent/regular stops: /stops/[stop_id]/index.html
  let stopDir;
  if (parentStop) {
    // This is a child stop - create nested path
    stopDir = join(distDir, 'stops', parentStop.stop_id, stop.stop_id);
  } else {
    // This is a parent or regular stop
    stopDir = join(distDir, 'stops', stop.stop_id);
  }
  
  if (!existsSync(stopDir)) {
    mkdirSync(stopDir, { recursive: true });
  }
  
  // Generate HTML using AssemblyScript
  const childStopIds = childStops.map(c => c.stop_id);
  const childStopNames = childStops.map(c => c.stop_name);
  const parentStopId = parentStop ? parentStop.stop_id : '';
  const parentStopName = parentStop ? parentStop.stop_name : '';
  const hasRoutes = stopTimes.length > 0;
  
  let html = wasmModule.generateStopPage(
    stop.stop_name,
    stop.stop_id,
    parentStopId,
    parentStopName,
    childStopIds,
    childStopNames,
    hasRoutes
  );
  
  // Add schedule
  const timesByHour = groupStopTimesByHour(stopTimes);
  const hours = Object.keys(timesByHour).map(Number).sort((a, b) => a - b);
  
  let scheduleContent = '';
  for (const hour of hours) {
    const times = timesByHour[hour];
    scheduleContent = wasmModule.addScheduleHour(scheduleContent, hour);
    
    for (const stopTime of times) {
      const trip = indexes.tripMap.get(stopTime.trip_id);
      const route = trip ? indexes.routeMap.get(trip.route_id) : null;
      
      const routeName = route ? (route.route_short_name || route.route_long_name) : 'Unknown';
      const time = wasmModule.formatTime(stopTime.arrival_time);
      const headsign = trip?.trip_headsign || '';
      
      scheduleContent = wasmModule.addScheduleEntry(scheduleContent, time, routeName, headsign);
    }
    
    scheduleContent = wasmModule.closeScheduleHour(scheduleContent);
  }
  
  html = html.replace('</body>', scheduleContent + '</body>');
  
  // Generate CSV using fast method
  const csvBuffer = generateStopCSVFast(stop, stopTimes, indexes);
  
  // Write both files in parallel using streams
  await Promise.all([
    writeFileStreamFast(join(stopDir, 'index.html'), Buffer.from(html)),
    writeFileStreamFast(join(stopDir, 'schedule.csv'), csvBuffer)
  ]);
}

/**
 * Process a batch of stops in parallel
 */
async function processBatchParallel(stops, wasmModule, indexes, stopTimesMap, childrenMap, parentMap, distDir) {
  const promises = [];
  
  for (const stop of stops) {
    const stopTimes = stopTimesMap[stop.stop_id] || [];
    const childStops = childrenMap[stop.stop_id] || [];
    const parentStop = parentMap[stop.stop_id] || null;
    
    // Skip stops with no data
    if (stopTimes.length === 0 && childStops.length === 0 && !parentStop) {
      continue;
    }
    
    promises.push(
      processStop(stop, stopTimes, childStops, parentStop, wasmModule, indexes, distDir)
    );
  }
  
  await Promise.all(promises);
  return promises.length;
}

/**
 * Generate stop pages with maximum performance optimizations
 */
async function generateStopPages() {
  console.log('🚀 Ultra-Optimized Generator Starting...');
  console.log(`💪 Using ${NUM_WORKERS} CPU cores`);
  
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
    const gtfsData = loadGTFSDataWithIndexes(agencyPath);
    const parseTime = ((Date.now() - parseStart) / 1000).toFixed(2);
    
    if (gtfsData.stops.length === 0) {
      console.log('  ⚠ No stops found');
      continue;
    }
    
    console.log(`  ✓ Parsed GTFS in ${parseTime}s`);
    console.log(`  📦 ${gtfsData.stops.length} stops, ${gtfsData.stopTimes.length} stop times`);
    
    // Build indexes
    const indexStart = Date.now();
    const stopTimesMap = {};
    for (const stopTime of gtfsData.stopTimes) {
      if (!stopTimesMap[stopTime.stop_id]) {
        stopTimesMap[stopTime.stop_id] = [];
      }
      stopTimesMap[stopTime.stop_id].push(stopTime);
    }
    
    const stopMap = {};
    const childrenMap = {};
    const parentMap = {};
    
    for (const stop of gtfsData.stops) {
      stopMap[stop.stop_id] = stop;
      if (stop.parent_station && stop.parent_station.trim() !== '') {
        const parentId = stop.parent_station;
        if (!childrenMap[parentId]) {
          childrenMap[parentId] = [];
        }
        childrenMap[parentId].push(stop);
      }
    }
    
    for (const [parentId, children] of Object.entries(childrenMap)) {
      for (const child of children) {
        parentMap[child.stop_id] = stopMap[parentId];
      }
    }
    
    const indexTime = ((Date.now() - indexStart) / 1000).toFixed(2);
    console.log(`  ✓ Built indexes in ${indexTime}s`);
    
    // Process stops in smaller batches for better parallelization
    const batchSize = Math.max(1, Math.ceil(gtfsData.stops.length / (NUM_WORKERS * 4)));
    const batches = [];
    
    for (let i = 0; i < gtfsData.stops.length; i += batchSize) {
      batches.push(gtfsData.stops.slice(i, i + batchSize));
    }
    
    console.log(`  🔧 Processing ${batches.length} batches (${batchSize} stops/batch)...`);
    
    const genStart = Date.now();
    const results = await Promise.all(
      batches.map(batch => 
        processBatchParallel(batch, wasmModule, gtfsData, stopTimesMap, childrenMap, parentMap, distDir)
      )
    );
    
    const genTime = ((Date.now() - genStart) / 1000).toFixed(2);
    const agencyTotal = results.reduce((sum, count) => sum + count, 0);
    totalStops += agencyTotal;
    
    console.log(`  ✅ Generated ${agencyTotal} stops in ${genTime}s (${(agencyTotal / genTime).toFixed(0)} pages/sec)`);
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n🎉 Complete: ${totalStops} stops in ${elapsed}s`);
  console.log(`⚡ Average: ${(totalStops / elapsed).toFixed(0)} pages/second`);
  console.log(`📁 Output: dist/stops/[stop-id]/index.html + schedule.csv`);
}

generateStopPages().catch(console.error);
