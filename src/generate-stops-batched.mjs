// Batched Stop Generator with WASM Processing
// Processes multiple stops at once in WASM, returns concatenated HTML, streams to files
// Uses THROTTLE environment variable to control batch size

import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { cpus } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Batch size controlled by environment variable (default: 50)
const BATCH_SIZE = parseInt(process.env.THROTTLE || '50', 10);
console.log(`Using batch size: ${BATCH_SIZE}`);

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

  const lines = stopsCSV.trim().split('\n');
  const headers = lines[0].split(',');
  const idIdx = headers.indexOf('stop_id');
  const nameIdx = headers.indexOf('stop_name');
  const parentIdx = headers.indexOf('parent_station');

  const stops = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length >= headers.length) {
      stops.push({
        id: parts[idIdx]?.trim() || '',
        name: parts[nameIdx]?.trim() || '',
        parentId: parts[parentIdx]?.trim() || ''
      });
    }
  }

  return stops;
}

/**
 * Process batch of stops with WASM
 */
async function processBatch(
  batch,
  agencyName,
  agencyPath,
  tripCSV,
  routeCSV,
  calendarCSV,
  wasmModule,
  distDir
) {
  // Prepare data for batch
  // Process stops ONE AT A TIME to avoid complex 2D array passing issues
  const htmlResults = [];
  const stopDirs = [];

  for (const stop of batch) {
    // Read stop-specific stop_times CSV
    const stopTimesFile = join(agencyPath, 'stop_times_by_stop', `${stop.id}-stop_times.csv`);
    const stopTimesCSV = existsSync(stopTimesFile) ? readFileSync(stopTimesFile, 'utf-8') : '';

    // Determine stop directory
    let stopDir;
    if (stop.parentId) {
      stopDir = join(distDir, 'stops', stop.parentId, stop.id);
    } else {
      stopDir = join(distDir, 'stops', stop.id);
    }

    if (!existsSync(stopDir)) {
      mkdirSync(stopDir, { recursive: true });
    }

    // Call WASM for SINGLE stop (pass comma-separated strings instead of arrays!)
    const html = wasmModule.processStopAndGenerateHTML(
      stop.name,
      stop.id,
      stop.parentId || '',
      stop.parentName || '',
      agencyName,
      (stop.childIds || []).join(','),
      (stop.childNames || []).join(','),
      stopTimesCSV,
      tripCSV,
      routeCSV,
      calendarCSV
    );

    htmlResults.push(html);
    stopDirs.push(stopDir);
  }

  // Write all HTML files in parallel
  const writePromises = [];
  for (let i = 0; i < htmlResults.length; i++) {
    const htmlFile = join(stopDirs[i], 'index.html');
    writePromises.push(writeFileStream(htmlFile, htmlResults[i]));
  }

  await Promise.all(writePromises);
}

/**
 * Generate stop pages with batched WASM processing
 */
async function generateStopPages() {
  console.log('Starting batched stop page generation...\n');
  const startTime = Date.now();

  // Load WASM module
  console.log('Loading WASM module...');
  const wasmModule = await import('../dist/release.js');
  console.log('✅ WASM module loaded\n');

  // Setup directories
  const gtfsDir = join(rootDir, 'data');
  const distDir = join(rootDir, 'public');

  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }

  // Get agencies
  const agencies = readdirSync(gtfsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  console.log(`Found ${agencies.length} agencies: ${agencies.join(', ')}\n`);

  let totalStops = 0;

  for (const agency of agencies) {
    console.log(`Processing agency: ${agency}`);
    const agencyPath = join(gtfsDir, agency);

    // Split stop_times.txt if needed
    const stopTimesFile = join(agencyPath, 'stop_times.txt');
    const stopTimesByStopDir = join(agencyPath, 'stop_times_by_stop');
    
    if (!existsSync(stopTimesByStopDir) && existsSync(stopTimesFile)) {
      console.log(`  📂 Splitting stop_times.txt into individual stop files...`);
      const { splitStopTimesByStopAndRoute } = await import('./modules/streaming-gtfs-parser.mjs');
      const tripsFile = join(agencyPath, 'trips.txt');
      
      await splitStopTimesByStopAndRoute(stopTimesFile, tripsFile, agencyPath, (processed, total) => {
        if (processed % 100000 === 0 || processed === total) {
          process.stdout.write(`\r  ⏳ Processed ${processed.toLocaleString()}/${total.toLocaleString()} stop times...`);
        }
      });
      console.log('\n  ✅ Split complete!\n');
    }

    // Load shared CSV files once per agency
    const tripCSV = loadCSV(join(agencyPath, 'trips.txt'));
    const routeCSV = loadCSV(join(agencyPath, 'routes.txt'));
    const calendarCSV = loadCSV(join(agencyPath, 'calendar.txt'));

    // Parse stops
    const stops = parseStops(join(agencyPath, 'stops.txt'));
    console.log(`Found ${stops.length} stops for ${agency}`);

    // Build parent-child relationships
    const stopsById = new Map();
    for (const stop of stops) {
      stopsById.set(stop.id, stop);
      stop.childIds = [];
      stop.childNames = [];
    }

    for (const stop of stops) {
      if (stop.parentId && stopsById.has(stop.parentId)) {
        const parent = stopsById.get(stop.parentId);
        parent.childIds.push(stop.id);
        parent.childNames.push(stop.name);
        stop.parentName = parent.name;
      }
    }

    // Process in batches
    const batches = [];
    for (let i = 0; i < stops.length; i += BATCH_SIZE) {
      batches.push(stops.slice(i, i + BATCH_SIZE));
    }

    console.log(`Processing ${batches.length} batches (${BATCH_SIZE} stops per batch)...`);

    const batchStartTime = Date.now();
    let processedStops = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      await processBatch(
        batch,
        agency,
        agencyPath,
        tripCSV,
        routeCSV,
        calendarCSV,
        wasmModule,
        distDir
      );

      processedStops += batch.length;

      // Progress update every 10 batches
      if ((i + 1) % 10 === 0 || i === batches.length - 1) {
        const elapsed = (Date.now() - batchStartTime) / 1000;
        const rate = processedStops / elapsed;
        const remaining = stops.length - processedStops;
        const eta = remaining / rate;

        console.log(
          `  Batch ${i + 1}/${batches.length}: ${processedStops}/${stops.length} stops ` +
          `(${rate.toFixed(1)} pages/sec, ETA: ${eta.toFixed(1)}s)`
        );
      }
    }

    const agencyTime = ((Date.now() - batchStartTime) / 1000).toFixed(1);
    console.log(`✅ ${agency}: ${stops.length} stops in ${agencyTime}s\n`);
    totalStops += stops.length;
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const avgRate = (totalStops / (Date.now() - startTime) * 1000).toFixed(1);

  console.log('═══════════════════════════════════════════');
  console.log(`✅ Generation complete!`);
  console.log(`Total stops: ${totalStops}`);
  console.log(`Total time: ${totalTime}s`);
  console.log(`Average rate: ${avgRate} pages/sec`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log('═══════════════════════════════════════════\n');
}

// Run generator
generateStopPages().catch(error => {
  console.error('Generation failed:', error);
  process.exit(1);
});
