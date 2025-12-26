// Rust WASM Generator - Complete HTML generation in Rust
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { generate_stop_page } from '../pkg/bus_fyi_wasm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

/**
 * Split stop_times.txt by stop_id
 */
async function splitStopTimes(dataDir) {
  console.log('Splitting stop_times.txt by stop...');
  
  const stopTimesPath = join(dataDir, 'stop_times.txt');
  const outputDir = join(dataDir, 'stop_times_by_stop');
  
  if (existsSync(outputDir)) {
    console.log('✅ stop_times_by_stop directory already exists, skipping split\n');
    return;
  }
  
  mkdirSync(outputDir, { recursive: true });
  
  const fileStreams = new Map();
  let lineCount = 0;
  let stopCount = 0;
  
  const rl = createInterface({
    input: createReadStream(stopTimesPath),
    crlfDelay: Infinity
  });
  
  let header = '';
  let isFirstLine = true;
  
  for await (const line of rl) {
    if (isFirstLine) {
      header = line + '\n';
      isFirstLine = false;
      continue;
    }
    
    lineCount++;
    
    // Extract stop_id (3rd column typically)
    const parts = line.split(',');
    const stopId = parts[3];
    
    if (!stopId) continue;
    
    // Get or create stream for this stop
    if (!fileStreams.has(stopId)) {
      const filePath = join(outputDir, `${stopId}-stop_times.csv`);
      const stream = createWriteStream(filePath);
      stream.write(header);
      fileStreams.set(stopId, stream);
      stopCount++;
    }
    
    const stream = fileStreams.get(stopId);
    stream.write(line + '\n');
    
    if (lineCount % 500000 === 0) {
      console.log(`  Processed ${lineCount.toLocaleString()} lines, ${stopCount} stops...`);
    }
  }
  
  // Close all streams
  for (const stream of fileStreams.values()) {
    stream.end();
  }
  
  console.log(`✅ Split complete: ${lineCount.toLocaleString()} lines into ${stopCount} stop files\n`);
}

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
 * Process a single stop and generate HTML using Rust WASM
 */
async function processStop(
  stopId, stopName, parentId, parentName, childStops,
  stopTimesData, routesCsv, tripsCsv, calendarCsv,
  distDir
) {
  try {
    // Prepare stop directory
    let stopDir;
    if (parentId) {
      stopDir = join(distDir, 'stops', parentId, stopId);
    } else {
      stopDir = join(distDir, 'stops', stopId);
    }
    
    if (!existsSync(stopDir)) {
      mkdirSync(stopDir, { recursive: true });
    }
    
    // Convert child stops to JSON
    const childStopsJson = JSON.stringify(childStops);
    
    // Call Rust WASM to generate complete HTML
    const html = generate_stop_page(
      stopId,
      stopName,
      parentId || '',
      parentName || '',
      childStopsJson,
      stopTimesData,
      routesCsv,
      tripsCsv,
      calendarCsv
    );
    
    // Write to file
    const htmlPath = join(stopDir, 'index.html');
    await writeFile(htmlPath, html);
    
  } catch (error) {
    console.error(`Error processing stop ${stopId}:`, error.message);
    throw error;
  }
}

/**
 * Write file
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
  console.log('Starting stop page generation with Rust WASM...\n');
  
  const dataDir = join(rootDir, 'data', 'cta');
  const distDir = join(rootDir, 'dist');
  
  // Split stop_times if needed
  await splitStopTimes(dataDir);
  
  console.log('Rust WASM module loaded\n');
  
  // Load GTFS data
  console.log('Loading GTFS data...');
  
  const stopsPath = join(dataDir, 'stops.txt');
  const routesPath = join(dataDir, 'routes.txt');
  const tripsPath = join(dataDir, 'trips.txt');
  const calendarPath = join(dataDir, 'calendar.txt');
  
  const stopsData = parseCSV(readFileSync(stopsPath, 'utf-8'));
  
  // Load CSV files as strings (Rust will parse them)
  const routesCsv = readFileSync(routesPath, 'utf-8');
  const tripsCsv = readFileSync(tripsPath, 'utf-8');
  const calendarCsv = readFileSync(calendarPath, 'utf-8');
  
  console.log(`✅ Loaded ${stopsData.length} stops`);
  console.log(`✅ Loaded routes CSV (${routesCsv.split('\n').length - 1} entries)`);
  console.log(`✅ Loaded trips CSV (${tripsCsv.split('\n').length - 1} entries)`);
  console.log(`✅ Loaded calendar CSV (${calendarCsv.split('\n').length - 1} entries)\n`);
  
  // Build stop map
  const stopMap = new Map();
  const parentStops = [];
  
  for (const stop of stopsData) {
    stopMap.set(stop.stop_id, stop);
    
    if (!stop.parent_station || stop.parent_station === '') {
      parentStops.push(stop);
    }
  }
  
  console.log(`Found ${parentStops.length} parent/standalone stops\n`);
  
  // Check if stop_times is split
  const stopTimesByStopDir = join(dataDir, 'stop_times_by_stop');
  if (!existsSync(stopTimesByStopDir)) {
    console.error('❌ stop_times_by_stop directory not found!');
    console.error('Please run data splitting first.');
    process.exit(1);
  }
  
  // Process each stop
  let processed = 0;
  const totalStops = parentStops.length;
  
  console.log(`Processing ${totalStops} stops...\n`);
  
  // Process in batches for progress reporting
  const batchSize = parseInt(process.env.THROTTLE || '50', 10);
  
  for (let i = 0; i < parentStops.length; i += batchSize) {
    const batch = parentStops.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (stop) => {
      const stopId = stop.stop_id;
      const stopName = stop.stop_name;
      
      // Find child stops
      const childStops = [];
      for (const childStop of stopsData) {
        if (childStop.parent_station === stopId) {
          childStops.push({
            id: childStop.stop_id,
            name: childStop.stop_name
          });
        }
      }
      
      // Load stop times CSV
      const stopTimesPath = join(stopTimesByStopDir, `${stopId}-stop_times.csv`);
      let stopTimesCsv = '';
      
      if (existsSync(stopTimesPath)) {
        stopTimesCsv = readFileSync(stopTimesPath, 'utf-8');
      }
      
      // Process parent stop
      await processStop(
        stopId, stopName, '', '', childStops,
        stopTimesCsv, routesCsv, tripsCsv, calendarCsv,
        distDir
      );
      
      // Process child stops
      for (const childStop of childStops) {
        const childStopTimesPath = join(stopTimesByStopDir, `${childStop.id}-stop_times.csv`);
        let childStopTimesCsv = '';
        
        if (existsSync(childStopTimesPath)) {
          childStopTimesCsv = readFileSync(childStopTimesPath, 'utf-8');
        }
        
        await processStop(
          childStop.id, childStop.name, stopId, stopName, [],
          childStopTimesCsv, routesCsv, tripsCsv, calendarCsv,
          distDir
        );
      }
    }));
    
    processed += batch.length;
    const percent = Math.round((processed / totalStops) * 100);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (processed / (elapsed / 60)).toFixed(1);
    
    console.log(`[${percent}%] Processed ${processed}/${totalStops} stops (${rate} pages/min, ${elapsed}s elapsed)`);
  }
  
  const endTime = Date.now();
  const totalTime = ((endTime - startTime) / 1000).toFixed(1);
  const pagesPerSec = (processed / (totalTime / 60 / 60)).toFixed(1);
  
  console.log(`\n✅ Generation complete!`);
  console.log(`   Total stops: ${processed}`);
  console.log(`   Time: ${totalTime}s`);
  console.log(`   Rate: ${pagesPerSec} pages/sec`);
}

// Run generation
generateStopPages().catch(error => {
  console.error('Generation failed:', error);
  process.exit(1);
});
