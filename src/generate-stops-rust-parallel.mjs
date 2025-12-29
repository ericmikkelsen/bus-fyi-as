// Rust WASM Generator with Worker Thread Parallelization
import { Worker } from 'worker_threads';
import { existsSync, readdirSync, readFileSync, mkdirSync, createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generate_route_type_index_page, init_routes_and_trips } from '../pkg/bus_fyi_wasm.js';
import { splitStopTimes } from './split-stop-times.mjs';
import { cpus } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// GTFS route type names
const ROUTE_TYPE_NAMES = {
  '0': 'Tram',
  '1': 'Subway',
  '2': 'Rail',
  '3': 'Bus',
  '4': 'Ferry',
  '5': 'Cable Car',
  '6': 'Gondola',
  '7': 'Funicular',
};

/**
 * Parse CSV content into array of objects
 */
function parseCSV(csvText) {
  if (!csvText || csvText.trim() === '') return [];
  
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = line.split(',').map(v => v.trim());
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j] || '';
    }
    data.push(obj);
  }
  
  return data;
}

/**
 * NOTE: We do NOT pre-load stop_times CSVs into memory anymore.
 * Instead, workers load the individual stop CSV files on-demand from 
 * stop_times_by_stop/{stopId}-stop_times.csv
 * This reduces memory usage from ~100-150MB to ~10-20MB constant.
 */

/**
 * Process stops using worker threads for parallelization
 */
async function processStopsWithWorkers(
  stopsChunk,
  stopTimesByStopDir,
  routesCsv,
  tripsCsv,
  calendarCsv,
  distDir,
  agencyId,
  childrenByParent,
  workerCount
) {
  // Split stops into chunks for each worker
  const chunkSize = Math.ceil(stopsChunk.length / workerCount);
  const chunks = [];
  for (let i = 0; i < stopsChunk.length; i += chunkSize) {
    chunks.push(stopsChunk.slice(i, i + chunkSize));
  }
  
  // Create workers and process chunks in parallel
  const workerPromises = chunks.map((chunk, index) => {
    return new Promise((resolve, reject) => {
      const worker = new Worker(join(__dirname, 'generate-stops-worker.mjs'), {
        workerData: {
          stopsChunk: chunk,
          stopTimesByStopDir,
          routesCsv,
          tripsCsv,
          calendarCsv,
          distDir,
          agencyId,
          childrenByParent
        }
      });
      
      worker.on('message', (message) => {
        if (message.success) {
          resolve(message.results);
        } else {
          reject(new Error(message.error));
        }
      });
      
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });
  });
  
  // Wait for all workers to complete
  const allResults = await Promise.all(workerPromises);
  
  // Flatten results from all workers
  return allResults.flat();
}

/**
 * Write file asynchronously
 */
async function writeFile(filePath, content) {
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(filePath);
    stream.write(content);
    stream.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

/**
 * Main generation function
 */
async function generateStopPages() {
  const startTime = Date.now();
  console.log('Starting stop page generation with Rust WASM + Worker Thread Parallelization...\n');
  
  const dataDir = join(rootDir, 'data', 'cta');
  const distDir = join(rootDir, 'dist');
  const agencyId = 'cta';
  
  // Determine worker count (default to CPU count, max 8, min 2)
  const workerCount = Math.min(Math.max(cpus().length, 2), parseInt(process.env.WORKERS || '8', 10));
  console.log(`🔧 Using ${workerCount} worker threads for parallel processing\n`);
  
  // Split stop_times if needed
  await splitStopTimes(dataDir);
  
  // Directory for split stop_times files
  const stopTimesByStopDir = join(dataDir, 'stop_times_by_stop');
  
  console.log('Rust WASM module loaded\n');
  
  // Load GTFS data
  console.log('Loading GTFS data...');
  
  const stopsPath = join(dataDir, 'stops.txt');
  const routesPath = join(dataDir, 'routes.txt');
  const tripsPath = join(dataDir, 'trips.txt');
  const calendarPath = join(dataDir, 'calendar.txt');
  
  const stopsData = parseCSV(readFileSync(stopsPath, 'utf-8'));
  
  // Load CSV files as strings
  const routesCsv = readFileSync(routesPath, 'utf-8');
  const tripsCsv = readFileSync(tripsPath, 'utf-8');
  const calendarCsv = readFileSync(calendarPath, 'utf-8');
  
  // Initialize routes and trips data in main thread (workers will do their own init)
  console.log('🔧 Initializing routes and trips data in Rust WASM...');
  init_routes_and_trips(routesCsv, tripsCsv);
  console.log('✅ Routes and trips cached in Rust - ready for fast processing!\n');
  
  // Parse routes for logging
  const routesData = parseCSV(routesCsv);
  const routeTypeCount = new Map();
  for (const route of routesData) {
    const rt = route.route_type || 'undefined';
    routeTypeCount.set(rt, (routeTypeCount.get(rt) || 0) + 1);
  }
  
  console.log(`✅ Loaded ${stopsData.length} stops`);
  console.log(`✅ Loaded ${routesData.length} routes`);
  console.log(`   Route types found:`);
  for (const [routeType, count] of Array.from(routeTypeCount.entries()).sort()) {
    const typeName = ROUTE_TYPE_NAMES[routeType] || `Type ${routeType}`;
    console.log(`     ${typeName} (${routeType}): ${count} routes`);
  }
  const tripsCount = tripsCsv.split('\n').length - 1;
  console.log(`✅ Loaded ${tripsCount} trips`);
  console.log(`✅ Loaded calendar CSV (${calendarCsv.split('\n').length - 1} entries)\n`);
  
  // Build stop map and categorize stops
  const stopMap = new Map();
  const parentStops = [];
  const childStopsWithoutParent = [];
  const childrenByParent = {};
  
  for (const stop of stopsData) {
    stopMap.set(stop.stop_id, stop);
    
    if (!stop.parent_station || stop.parent_station === '') {
      parentStops.push(stop);
    }
  }
  
  // Build parent-to-children mapping
  const parentStopIds = new Set(parentStops.map(s => s.stop_id));
  for (const stop of stopsData) {
    if (stop.parent_station && stop.parent_station !== '') {
      if (parentStopIds.has(stop.parent_station)) {
        if (!childrenByParent[stop.parent_station]) {
          childrenByParent[stop.parent_station] = [];
        }
        childrenByParent[stop.parent_station].push({
          id: stop.stop_id,
          name: stop.stop_name
        });
      } else {
        childStopsWithoutParent.push(stop);
      }
    }
  }
  
  console.log(`Found ${parentStops.length} parent/standalone stops`);
  console.log(`Found ${childStopsWithoutParent.length} orphaned child stops (parent not in dataset)\n`);
  
  const totalStops = parentStops.length + childStopsWithoutParent.length;
  console.log(`Processing ${parentStops.length} parent/standalone stops + ${childStopsWithoutParent.length} orphaned child stops = ${totalStops} total stops...\n`);
  console.log('Format: [location_type] [route_types] Stop Name (stop_id) → filepath\n');
  
  // Track stops by route type
  const stopsByRouteType = new Map();
  let stopsWithNoRoutes = 0;
  let childrenProcessed = 0;
  
  // Process parent/standalone stops with workers
  console.log(`⚡ Processing ${parentStops.length} parent stops with ${workerCount} workers...`);
  const parentResults = await processStopsWithWorkers(
    parentStops,
    stopTimesByStopDir,
    routesCsv,
    tripsCsv,
    calendarCsv,
    distDir,
    agencyId,
    childrenByParent,
    workerCount
  );
  
  // Process results and update tracking
  for (const result of parentResults) {
    if (result.error) {
      console.error(`❌ Error processing stop ${result.stopId}: ${result.error}`);
      continue;
    }
    
    // Add to route type indexes
    if (result.hasRoutes) {
      for (const routeType of result.allRouteTypes) {
        if (!stopsByRouteType.has(routeType)) {
          stopsByRouteType.set(routeType, []);
        }
        stopsByRouteType.get(routeType).push({
          stop_id: result.stopId,
          stop_name: result.stopName,
          location_type: result.locationType,
          route_types: result.allRouteTypes
        });
      }
    } else {
      stopsWithNoRoutes++;
    }
    
    childrenProcessed += result.childrenProcessed;
    
    // Log output
    const childrenInfo = result.childrenCount > 0 ? ` [${result.childrenCount} children]` : '';
    console.log(`[${result.stopType}] ${result.routeTypeDisplay} "${result.stopName}" (${result.stopId})${childrenInfo} → ${result.parentFilePath}`);
    
    for (const logEntry of result.childLogEntries) {
      console.log(logEntry);
    }
  }
  
  const afterParents = Date.now();
  const parentElapsed = ((afterParents - startTime) / 1000).toFixed(1);
  const parentRate = (parentStops.length / (parentElapsed / 60)).toFixed(1);
  console.log(`\n✅ Completed ${parentStops.length} parent stops in ${parentElapsed}s (${parentRate} stops/min)\n`);
  
  // Process orphaned child stops with workers
  console.log(`⚡ Processing ${childStopsWithoutParent.length} orphaned child stops with ${workerCount} workers...`);
  const orphanResults = await processStopsWithWorkers(
    childStopsWithoutParent,
    stopTimesByStopDir,
    routesCsv,
    tripsCsv,
    calendarCsv,
    distDir,
    agencyId,
    {}, // No children for orphaned stops
    workerCount
  );
  
  // Process orphan results
  for (const result of orphanResults) {
    if (result.error) {
      console.error(`❌ Error processing orphaned stop ${result.stopId}: ${result.error}`);
      continue;
    }
    
    if (result.hasRoutes) {
      for (const routeType of result.allRouteTypes) {
        if (!stopsByRouteType.has(routeType)) {
          stopsByRouteType.set(routeType, []);
        }
        stopsByRouteType.get(routeType).push({
          stop_id: result.stopId,
          stop_name: result.stopName,
          location_type: result.locationType,
          route_types: result.allRouteTypes
        });
      }
    } else {
      stopsWithNoRoutes++;
    }
  }
  
  const afterOrphans = Date.now();
  const orphanElapsed = ((afterOrphans - afterParents) / 1000).toFixed(1);
  const orphanRate = (childStopsWithoutParent.length / (orphanElapsed / 60)).toFixed(1);
  console.log(`\n✅ Completed ${childStopsWithoutParent.length} orphaned stops in ${orphanElapsed}s (${orphanRate} stops/min)\n`);
  
  // Generate route type index pages
  console.log(`\n📊 Generating route type index pages...`);
  for (const [routeType, stops] of stopsByRouteType.entries()) {
    const typeName = ROUTE_TYPE_NAMES[routeType] || `Type ${routeType}`;
    const typeNameLower = typeName.toLowerCase().replace(/ /g, '-');
    
    // Sort stops alphabetically by name
    stops.sort((a, b) => a.stop_name.localeCompare(b.stop_name));
    
    // Generate index page HTML using Rust
    const indexHtml = generate_route_type_index_page(
      routeType,
      typeName,
      JSON.stringify(stops),
      agencyId
    );
    
    // Write index page
    const indexDir = join(distDir, agencyId, 'stops', typeNameLower);
    if (!existsSync(indexDir)) {
      mkdirSync(indexDir, { recursive: true });
    }
    const indexPath = join(indexDir, 'index.html');
    await writeFile(indexPath, indexHtml);
    
    console.log(`  ✅ ${typeName} (${stops.length} stops) → ${agencyId}/stops/${typeNameLower}/index.html`);
  }
  
  // Print summary
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalPages = parentStops.length + childrenProcessed + childStopsWithoutParent.length;
  const overallRate = (totalPages / (totalTime / 60)).toFixed(1);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Generation complete!`);
  console.log(`   Total pages: ${totalPages}`);
  console.log(`   Parent stops: ${parentStops.length}`);
  console.log(`   Child stops: ${childrenProcessed}`);
  console.log(`   Orphaned stops: ${childStopsWithoutParent.length}`);
  console.log(`   Stops with no routes: ${stopsWithNoRoutes}`);
  console.log(`   Route type indexes: ${stopsByRouteType.size}`);
  console.log(`   Total time: ${totalTime}s`);
  console.log(`   Processing rate: ${overallRate} pages/min`);
  console.log(`   Workers used: ${workerCount}`);
  console.log(`${'='.repeat(60)}`);
}

// Run generator
generateStopPages().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
