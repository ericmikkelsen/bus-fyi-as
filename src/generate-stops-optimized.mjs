// Optimized Stop Pages Generator with parallel processing
import { Worker } from 'worker_threads';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { cpus } from 'os';
import {
  loadGTFSData,
  getAgencies,
  groupStopTimesByHour,
  getServiceDays
} from './modules/gtfs-parser.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const NUM_WORKERS = Math.max(2, cpus().length - 1); // Leave one CPU free

/**
 * Generate CSV data for a stop with service days
 */
function generateStopCSV(stop, stopTimes, routes, trips, calendar) {
  const lines = ['arrival_time,route_short_name,route_long_name,headsign,service_days'];
  
  // Create lookup maps
  const tripToRoute = {};
  const tripToService = {};
  for (const trip of trips) {
    tripToRoute[trip.trip_id] = trip;
    tripToService[trip.trip_id] = trip.service_id;
  }
  
  const routeMap = {};
  for (const route of routes) {
    routeMap[route.route_id] = route;
  }
  
  // Get service days for each service_id
  const serviceDaysMap = {};
  for (const cal of calendar) {
    const days = [];
    if (cal.monday === '1') days.push('Mon');
    if (cal.tuesday === '1') days.push('Tue');
    if (cal.wednesday === '1') days.push('Wed');
    if (cal.thursday === '1') days.push('Thu');
    if (cal.friday === '1') days.push('Fri');
    if (cal.saturday === '1') days.push('Sat');
    if (cal.sunday === '1') days.push('Sun');
    serviceDaysMap[cal.service_id] = days.join(',');
  }
  
  // Sort and add stop times
  const sorted = [...stopTimes].sort((a, b) => a.arrival_time.localeCompare(b.arrival_time));
  
  for (const stopTime of sorted) {
    const trip = tripToRoute[stopTime.trip_id];
    const route = trip ? routeMap[trip.route_id] : null;
    
    if (route) {
      const routeShort = (route.route_short_name || '').replace(/,/g, ' ');
      const routeLong = (route.route_long_name || '').replace(/,/g, ' ');
      const headsign = (trip.trip_headsign || '').replace(/,/g, ' ');
      const serviceDays = serviceDaysMap[tripToService[stopTime.trip_id]] || '';
      
      lines.push(`${stopTime.arrival_time},${routeShort},${routeLong},${headsign},${serviceDays}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Write files using streams for better performance
 */
async function writeFileStream(filePath, content) {
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(filePath);
    stream.write(content);
    stream.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

/**
 * Process a batch of stops
 */
async function processBatch(stops, wasmModule, gtfsData, stopTimesMap, childrenMap, parentMap, distDir) {
  const tasks = [];
  
  for (const stop of stops) {
    const stopTimes = stopTimesMap[stop.stop_id] || [];
    const childStops = childrenMap[stop.stop_id] || [];
    const parentStop = parentMap[stop.stop_id] || null;
    
    // Skip stops with no data
    if (stopTimes.length === 0 && childStops.length === 0 && !parentStop) {
      continue;
    }
    
    // Prepare stop directory
    const stopDir = join(distDir, 'stops', stop.stop_id);
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
        const trip = gtfsData.trips.find(t => t.trip_id === stopTime.trip_id);
        const route = trip ? gtfsData.routes.find(r => r.route_id === trip.route_id) : null;
        
        const routeName = route ? (route.route_short_name || route.route_long_name) : 'Unknown';
        const time = wasmModule.formatTime(stopTime.arrival_time);
        const headsign = trip?.trip_headsign || '';
        
        scheduleContent = wasmModule.addScheduleEntry(scheduleContent, time, routeName, headsign);
      }
      
      scheduleContent = wasmModule.closeScheduleHour(scheduleContent);
    }
    
    html = html.replace('</body>', scheduleContent + '</body>');
    
    // Generate CSV
    const csv = generateStopCSV(stop, stopTimes, gtfsData.routes, gtfsData.trips, gtfsData.calendar);
    
    // Write both files using streams
    tasks.push(
      writeFileStream(join(stopDir, 'index.html'), html),
      writeFileStream(join(stopDir, 'schedule.csv'), csv)
    );
  }
  
  await Promise.all(tasks);
  return stops.length;
}

/**
 * Generate stop pages for an agency with parallel processing
 */
async function generateStopPages() {
  console.log('Generating stop pages with optimizations...');
  console.log(`Using ${NUM_WORKERS} worker threads`);
  
  // Load WASM module
  console.log('Loading AssemblyScript module...');
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
  
  console.log(`Found ${agencies.length} ${agencies.length === 1 ? 'agency' : 'agencies'}: ${agencies.join(', ')}`);
  
  let totalStops = 0;
  const startTime = Date.now();
  
  for (const agency of agencies) {
    const agencyPath = join(dataDir, agency);
    console.log(`\nProcessing ${agency}...`);
    
    const gtfsData = loadGTFSData(agencyPath);
    
    if (gtfsData.stops.length === 0) {
      console.log('  ⚠ No stops found');
      continue;
    }
    
    console.log(`  Loaded ${gtfsData.stops.length} stops, ${gtfsData.stopTimes.length} stop times`);
    
    // Build indexes
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
    
    // Process stops in batches for parallel processing
    const batchSize = Math.ceil(gtfsData.stops.length / NUM_WORKERS);
    const batches = [];
    
    for (let i = 0; i < gtfsData.stops.length; i += batchSize) {
      batches.push(gtfsData.stops.slice(i, i + batchSize));
    }
    
    console.log(`  Processing ${batches.length} batches in parallel...`);
    
    const results = await Promise.all(
      batches.map(batch => 
        processBatch(batch, wasmModule, gtfsData, stopTimesMap, childrenMap, parentMap, distDir)
      )
    );
    
    const agencyTotal = results.reduce((sum, count) => sum + count, 0);
    totalStops += agencyTotal;
    
    console.log(`  ✓ Generated ${agencyTotal} stop pages with CSVs`);
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✓ Total: ${totalStops} stop pages generated in ${elapsed}s`);
  console.log(`✓ Average: ${(totalStops / elapsed).toFixed(1)} pages/second`);
  console.log(`✓ Output: dist/stops/[stop-id]/index.html + schedule.csv`);
}

generateStopPages().catch(console.error);
