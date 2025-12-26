// Stop Generator with Raw Bindings (@assemblyscript/loader)
// Uses manual memory management to avoid ESM bindings refcount errors
// Processes stops individually in WASM with proper __pin/__unpin/__getString

import { instantiate } from '@assemblyscript/loader';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { splitStopTimesByStopAndRoute } from './modules/streaming-gtfs-parser.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Batch size for parallel file writes (default: 50)
let throttleArg = process.argv.find(arg => arg.startsWith('--throttle='));
let defaultThrottle = throttleArg ? parseInt(throttleArg.split('=')[1], 10) : 50;
const BATCH_SIZE = parseInt(process.env.THROTTLE || defaultThrottle, 10);
console.log(`Using batch size: ${BATCH_SIZE} for parallel writes`);

/**
 * Write file using streams
 */
async function writeFileStream(filePath, content) {
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(filePath, { highWaterMark: 256 * 1024 });
    stream.write(content);
    stream.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

/**
 * Load CSV file as string
 */
function loadCSV(filePath) {
  if (!existsSync(filePath)) {
    return '';
  }
  return readFileSync(filePath, 'utf-8');
}

/**
 * Parse stops.txt to get all stops with parent relationships
 */
function parseStops(stopsPath) {
  const stopsCSV = loadCSV(stopsPath);
  if (!stopsCSV) return [];

  const lines = stopsCSV.split('\n');
  const headers = lines[0].split(',');
  const stopIdIdx = headers.indexOf('stop_id');
  const stopNameIdx = headers.indexOf('stop_name');
  const parentStationIdx = headers.indexOf('parent_station');

  const stops = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = lines[i].split(',');
    if (cols.length > Math.max(stopIdIdx, stopNameIdx, parentStationIdx)) {
      stops.push({
        stopId: cols[stopIdIdx],
        stopName: cols[stopNameIdx],
        parentStation: cols[parentStationIdx] || ''
      });
    }
  }
  return stops;
}

/**
 * Process a single stop using WASM with raw bindings
 */
async function processStopWithWASM(wasmModule, stopInfo, dataDir, agency) {
  const { stopId, stopName, parentStation } = stopInfo;
  
  // Load CSV files for this stop
  const stopTimesPath = join(dataDir, agency, 'stop_times_by_stop', `${stopId}-stop_times.csv`);
  const tripsPath = join(dataDir, agency, 'trips.csv');
  const routesPath = join(dataDir, agency, 'routes.csv');
  const calendarPath = join(dataDir, agency, 'calendar.csv');
  
  const stopTimesCsv = loadCSV(stopTimesPath);
  if (!stopTimesCsv) {
    return null; // Skip stops with no stop_times data
  }
  
  const tripsCsv = loadCSV(tripsPath);
  const routesCsv = loadCSV(routesPath);
  const calendarCsv = loadCSV(calendarPath);
  
  // Create strings in WASM memory using __newString
  const stopTimesCsvPtr = wasmModule.exports.__newString(stopTimesCsv);
  const tripsCsvPtr = wasmModule.exports.__newString(tripsCsv);
  const routesCsvPtr = wasmModule.exports.__newString(routesCsv);
  const calendarCsvPtr = wasmModule.exports.__newString(calendarCsv);
  const stopIdPtr = wasmModule.exports.__newString(stopId);
  const stopNamePtr = wasmModule.exports.__newString(stopName);
  const parentStationPtr = wasmModule.exports.__newString(parentStation);
  const agencyPtr = wasmModule.exports.__newString(agency);
  
  try {
    // Pin all input strings to prevent GC
    wasmModule.exports.__pin(stopTimesCsvPtr);
    wasmModule.exports.__pin(tripsCsvPtr);
    wasmModule.exports.__pin(routesCsvPtr);
    wasmModule.exports.__pin(calendarCsvPtr);
    wasmModule.exports.__pin(stopIdPtr);
    wasmModule.exports.__pin(stopNamePtr);
    wasmModule.exports.__pin(parentStationPtr);
    wasmModule.exports.__pin(agencyPtr);
    
    // Call WASM function to process stop and generate HTML
    const htmlPtr = wasmModule.exports.processStopAndGenerateHTML(
      stopTimesCsvPtr,
      tripsCsvPtr,
      routesCsvPtr,
      calendarCsvPtr,
      stopIdPtr,
      stopNamePtr,
      parentStationPtr,
      agencyPtr
    );
    
    // Pin the result to prevent GC
    wasmModule.exports.__pin(htmlPtr);
    
    // Get the HTML string from WASM memory
    const html = wasmModule.exports.__getString(htmlPtr);
    
    // Unpin the result
    wasmModule.exports.__unpin(htmlPtr);
    
    return html;
  } finally {
    // Unpin all input strings
    wasmModule.exports.__unpin(stopTimesCsvPtr);
    wasmModule.exports.__unpin(tripsCsvPtr);
    wasmModule.exports.__unpin(routesCsvPtr);
    wasmModule.exports.__unpin(calendarCsvPtr);
    wasmModule.exports.__unpin(stopIdPtr);
    wasmModule.exports.__unpin(stopNamePtr);
    wasmModule.exports.__unpin(parentStationPtr);
    wasmModule.exports.__unpin(agencyPtr);
  }
}

/**
 * Process a batch of stops in parallel (writes only)
 */
async function processBatch(wasmModule, stops, dataDir, agency, outputDir) {
  const htmlPromises = [];
  
  for (const stop of stops) {
    const promise = (async () => {
      const html = await processStopWithWASM(wasmModule, stop, dataDir, agency);
      if (!html) return null;
      
      const stopDir = join(outputDir, agency, 'stops', stop.stopId);
      mkdirSync(stopDir, { recursive: true });
      
      const htmlPath = join(stopDir, 'index.html');
      await writeFileStream(htmlPath, html);
      
      return stop.stopId;
    })();
    
    htmlPromises.push(promise);
  }
  
  return Promise.all(htmlPromises);
}

/**
 * Generate all stop pages using WASM with raw bindings
 */
async function generateStopPages(dataDir, outputDir) {
  console.log('Loading WASM module with raw bindings...');
  const wasmPath = join(rootDir, 'dist', 'release.wasm');
  
  // Instantiate WASM module with raw bindings
  const wasmModule = await instantiate(
    await readFileSync(wasmPath),
    {
      env: {
        abort: (msg, file, line, col) => {
          console.error(`WASM abort: ${msg} at ${file}:${line}:${col}`);
        }
      }
    },
    {
      // Provide more memory for large HTML string generation (16MB initial, 256MB max)
      initialMemory: 256,
      maximumMemory: 4096
    }
  );
  
  console.log('WASM module loaded successfully with raw bindings');
  
  // Get list of agencies
  const agencies = readdirSync(dataDir).filter(name => {
    const path = join(dataDir, name);
    return existsSync(join(path, 'stops.txt'));
  });
  
  console.log(`Found ${agencies.length} agencies: ${agencies.join(', ')}`);
  
  let lastSplitProgress = Date.now();
  
  for (const agency of agencies) {
    console.log(`\nProcessing agency: ${agency}`);
    
    const agencyPath = join(dataDir, agency);
    const stopTimesFile = join(agencyPath, 'stop_times.txt');
    const tripsFile = join(agencyPath, 'trips.txt');
    
    // Split stop_times by stop and route if not already done
    const stopTimesDir = join(agencyPath, 'stop_times_by_stop');
    if (!existsSync(stopTimesDir) && existsSync(stopTimesFile)) {
      console.log('  📂 Splitting stop_times.txt by stop and route...');
      await splitStopTimesByStopAndRoute(stopTimesFile, tripsFile, agencyPath, (processed, total) => {
        if (Date.now() - lastSplitProgress > 5000) {
          console.log(`    Progress: ${(processed / 1000000).toFixed(1)}M rows processed...`);
          lastSplitProgress = Date.now();
        }
      });
      const splitTime = ((Date.now() - Date.now()) / 1000).toFixed(1);
      console.log(`  ✓ stop_times.txt split complete - ${splitTime}s`);
    }
    
    const stopsPath = join(agencyPath, 'stops.txt');
    const stops = parseStops(stopsPath);
    console.log(`Found ${stops.length} stops`);
    
    const startTime = Date.now();
    let processedCount = 0;
    
    // Process stops in batches for parallel writes
    for (let i = 0; i < stops.length; i += BATCH_SIZE) {
      const batch = stops.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(stops.length / BATCH_SIZE);
      
      console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} stops)...`);
      
      const results = await processBatch(wasmModule, batch, dataDir, agency, outputDir);
      const successCount = results.filter(r => r !== null).length;
      processedCount += successCount;
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (processedCount / (Date.now() - startTime) * 1000).toFixed(1);
      const remaining = stops.length - processedCount;
      const eta = remaining > 0 ? ((remaining / rate)).toFixed(0) : 0;
      
      console.log(`  ✓ Batch complete: ${successCount}/${batch.length} stops generated`);
      console.log(`  Progress: ${processedCount}/${stops.length} stops (${rate} pages/sec, ETA: ${eta}s)`);
    }
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const avgRate = (processedCount / (Date.now() - startTime) * 1000).toFixed(1);
    
    console.log(`\n✓ Agency complete: ${processedCount} stops generated in ${totalTime}s (${avgRate} pages/sec)`);
  }
}

/**
 * Main entry point
 */
async function main() {
  const dataDir = join(rootDir, 'data');
  const outputDir = join(rootDir, 'public');
  
  if (!existsSync(dataDir)) {
    console.error('Error: data/ directory not found');
    console.error('Run: npm run download:gtfs');
    process.exit(1);
  }
  
  console.log('Starting stop page generation with raw bindings...');
  console.log(`Data directory: ${dataDir}`);
  console.log(`Output directory: ${outputDir}`);
  
  try {
    await generateStopPages(dataDir, outputDir);
    console.log('\n✅ All stop pages generated successfully!');
  } catch (error) {
    console.error('\n❌ Generation failed:', error);
    process.exit(1);
  }
}

main();
