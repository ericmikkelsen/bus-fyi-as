// Rust WASM Generator - Complete HTML generation in Rust
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { generate_stop_page, generate_route_type_index_page } from '../pkg/bus_fyi_wasm.js';

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
  distDir, agencyId
) {
  try {
    // Prepare stop directory with agency prefix
    let stopDir;
    if (parentId) {
      stopDir = join(distDir, agencyId, 'stops', parentId, stopId);
    } else {
      stopDir = join(distDir, agencyId, 'stops', stopId);
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
    
    // Return the relative path for logging
    return htmlPath.replace(distDir + '/', '');
    
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
  const agencyId = 'cta'; // Extract from data directory name
  
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
  
  // Parse routes to get route types
  const routesData = parseCSV(routesCsv);
  const routeMap = new Map();
  const routeTypeCount = new Map();
  for (const route of routesData) {
    routeMap.set(route.route_id, route);
    // Track route type distribution
    const rt = route.route_type || 'undefined';
    routeTypeCount.set(rt, (routeTypeCount.get(rt) || 0) + 1);
  }
  
  // Parse trips to link routes to stops
  const tripsData = parseCSV(tripsCsv);
  const tripToRoute = new Map();
  for (const trip of tripsData) {
    tripToRoute.set(trip.trip_id, trip.route_id);
  }
  
  console.log(`✅ Loaded ${stopsData.length} stops`);
  console.log(`✅ Loaded ${routesData.length} routes`);
  console.log(`   Route types found:`);
  for (const [routeType, count] of Array.from(routeTypeCount.entries()).sort()) {
    const typeName = ROUTE_TYPE_NAMES[routeType] || `Type ${routeType}`;
    console.log(`     ${typeName} (${routeType}): ${count} routes`);
  }
  console.log(`✅ Loaded ${tripsData.length} trips`);
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
  
  // Track stops by route type
  const stopsByRouteType = new Map();
  const stopRouteTypes = new Map(); // Map stop_id to Set of route_types
  
  // Process each stop
  let processed = 0;
  let childrenProcessed = 0;
  let stopsWithNoRoutes = 0;
  const totalStops = parentStops.length;
  
  console.log(`Processing ${totalStops} stops...\n`);
  console.log('Format: [location_type] [route_types] Stop Name (stop_id) → filepath\n');
  
  // Process in batches for progress reporting
  const batchSize = parseInt(process.env.THROTTLE || '50', 10);
  
  for (let i = 0; i < parentStops.length; i += batchSize) {
    const batch = parentStops.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (stop) => {
      const stopId = stop.stop_id;
      const stopName = stop.stop_name;
      const locationType = stop.location_type || '0';
      
      // Determine stop type
      let stopType = 'stop';
      if (locationType === '1') {
        stopType = 'station';
      } else if (locationType === '2') {
        stopType = 'entrance';
      } else if (locationType === '3') {
        stopType = 'node';
      } else if (locationType === '4') {
        stopType = 'boarding';
      }
      
      // Find child stops - only those that explicitly have THIS stop as parent
      const childStops = [];
      for (const childStop of stopsData) {
        if (childStop.parent_station && childStop.parent_station === stopId) {
          childStops.push({
            id: childStop.stop_id,
            name: childStop.stop_name
          });
        }
      }
      
      // Load stop times to determine route types
      const stopTimesPath = join(stopTimesByStopDir, `${stopId}-stop_times.csv`);
      let stopTimesCsv = '';
      const routeTypes = new Set();
      
      if (existsSync(stopTimesPath)) {
        stopTimesCsv = readFileSync(stopTimesPath, 'utf-8');
        
        // Parse stop times to get trips, then routes, then route_types
        const stopTimesData = parseCSV(stopTimesCsv);
        for (const stopTime of stopTimesData) {
          const routeId = tripToRoute.get(stopTime.trip_id);
          if (routeId) {
            const route = routeMap.get(routeId);
            if (route && route.route_type) {
              routeTypes.add(route.route_type);
            }
          }
        }
      }
      
      // Store route types for this stop
      stopRouteTypes.set(stopId, routeTypes);
      
      // Process parent stop
      const parentFilePath = await processStop(
        stopId, stopName, '', '', childStops,
        stopTimesCsv, routesCsv, tripsCsv, calendarCsv,
        distDir, agencyId
      );
      
      // Process child stops and collect their route types and log entries
      const childLogEntries = [];
      const allRouteTypes = new Set(routeTypes); // Start with parent's route types
      
      for (const childStop of childStops) {
        const childStopTimesPath = join(stopTimesByStopDir, `${childStop.id}-stop_times.csv`);
        let childStopTimesCsv = '';
        const childRouteTypes = new Set();
        
        if (existsSync(childStopTimesPath)) {
          childStopTimesCsv = readFileSync(childStopTimesPath, 'utf-8');
          
          // Parse stop times to get route types for child stop
          const childStopTimesData = parseCSV(childStopTimesCsv);
          for (const stopTime of childStopTimesData) {
            const routeId = tripToRoute.get(stopTime.trip_id);
            if (routeId) {
              const route = routeMap.get(routeId);
              if (route && route.route_type) {
                childRouteTypes.add(route.route_type);
                allRouteTypes.add(route.route_type); // Add child's route type to parent's collection
              }
            }
          }
        }
        
        const childFilePath = await processStop(
          childStop.id, childStop.name, stopId, stopName, [],
          childStopTimesCsv, routesCsv, tripsCsv, calendarCsv,
          distDir, agencyId
        );
        
        // Store child log entry for later output
        childLogEntries.push(`  ↳ [child] ${childStop.name} (${childStop.id}) → ${childFilePath}`);
        
        childrenProcessed++;
      }
      
      // Add parent stop to route type indexes with combined route types (parent + children)
      // Only add if stop has at least one route type
      if (allRouteTypes.size > 0) {
        for (const routeType of allRouteTypes) {
          if (!stopsByRouteType.has(routeType)) {
            stopsByRouteType.set(routeType, []);
          }
          stopsByRouteType.get(routeType).push({
            stop_id: stopId,
            stop_name: stopName,
            location_type: locationType,
            route_types: Array.from(allRouteTypes)
          });
        }
      } else {
        stopsWithNoRoutes++;
      }
      
      // Format combined route types for display
      const routeTypeNames = Array.from(allRouteTypes)
        .map(rt => ROUTE_TYPE_NAMES[rt] || `Type ${rt}`)
        .join(', ');
      const routeTypeDisplay = allRouteTypes.size > 0 ? `[${routeTypeNames}]` : '[No routes]';
      
      // Now log parent and children together to prevent interleaving
      const childrenInfo = childStops.length > 0 ? ` [${childStops.length} children]` : '';
      console.log(`[${stopType}] ${routeTypeDisplay} ${stopName} (${stopId})${childrenInfo} → ${parentFilePath}`);
      
      // Log all child stops immediately after parent
      for (const logEntry of childLogEntries) {
        console.log(logEntry);
      }
    }));
    
    processed += batch.length;
    const percent = Math.round((processed / totalStops) * 100);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (processed / (elapsed / 60)).toFixed(1);
    
    console.log(`[${percent}%] Processed ${processed}/${totalStops} stops (${rate} pages/min, ${elapsed}s elapsed)`);
  }
  
  // Generate route type index pages
  console.log(`\n📊 Generating route type index pages...`);
  
  // Sort route types by their names for consistent output
  const sortedRouteTypes = Array.from(stopsByRouteType.entries())
    .sort((a, b) => {
      const nameA = ROUTE_TYPE_NAMES[a[0]] || `Type ${a[0]}`;
      const nameB = ROUTE_TYPE_NAMES[b[0]] || `Type ${b[0]}`;
      return nameA.localeCompare(nameB);
    });
  
  for (const [routeType, stops] of sortedRouteTypes) {
    const routeTypeName = ROUTE_TYPE_NAMES[routeType] || `Type ${routeType}`;
    
    // Sort stops alphabetically by name
    const sortedStops = stops.sort((a, b) => a.stop_name.localeCompare(b.stop_name));
    const stopsJson = JSON.stringify(sortedStops);
    
    // Generate HTML using Rust WASM
    const html = generate_route_type_index_page(routeType, routeTypeName, stopsJson);
    
    // Write to file in agency folder
    const indexDir = join(distDir, agencyId, 'stops', routeTypeName.toLowerCase().replace(/\s+/g, '-'));
    if (!existsSync(indexDir)) {
      mkdirSync(indexDir, { recursive: true });
    }
    
    const indexPath = join(indexDir, 'index.html');
    await writeFile(indexPath, html);
    
    const relativePath = indexPath.replace(distDir + '/', '');
    console.log(`  ✅ ${routeTypeName} (${stops.length} stops) → ${relativePath}`);
  }
  
  const endTime = Date.now();
  const totalTime = ((endTime - startTime) / 1000).toFixed(1);
  const pagesPerSec = (processed / (totalTime / 60 / 60)).toFixed(1);
  
  console.log(`\n✅ Generation complete!`);
  console.log(`   Parent/standalone stops: ${processed}`);
  console.log(`   Child stops: ${childrenProcessed}`);
  console.log(`   Stops with no routes: ${stopsWithNoRoutes}`);
  console.log(`   Route type indexes: ${stopsByRouteType.size}`);
  console.log(`   Total pages: ${processed + childrenProcessed + stopsByRouteType.size}`);
  console.log(`   Time: ${totalTime}s`);
  console.log(`   Rate: ${pagesPerSec} pages/sec`);
}

// Run generation
generateStopPages().catch(error => {
  console.error('Generation failed:', error);
  process.exit(1);
});
