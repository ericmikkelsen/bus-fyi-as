// Worker thread for parallel stop processing
import { parentPort, workerData } from 'worker_threads';
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { generate_stop_page_cached, extract_stop_route_types, init_routes_and_trips, init_calendar } from '../pkg/bus_fyi_wasm.js';

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
 * Process a single stop and generate HTML using Rust WASM (CACHED VERSION - NO CSV PARSING!)
 */
async function processStop(
  stopId, stopName, parentId, parentName, childStops,
  stopTimesData,
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
    
    // Call Rust WASM to generate complete HTML using cached data (FAST!)
    const html = generate_stop_page_cached(
      stopId,
      stopName,
      parentId || '',
      parentName || '',
      childStopsJson,
      stopTimesData
    );
    
    // Write to file
    const htmlPath = join(stopDir, 'index.html');
    await writeFile(htmlPath, html);
    
    // Return the relative path for logging
    return htmlPath.replace(distDir + '/', '');
    
  } catch (error) {
    throw new Error(`Error processing stop ${stopId}: ${error.message}`);
  }
}

/**
 * Load stop times CSV on-demand from the split files directory
 */
function loadStopTimesCsv(stopTimesByStopDir, stopId) {
  const stopTimesPath = join(stopTimesByStopDir, `${stopId}-stop_times.csv`);
  if (existsSync(stopTimesPath)) {
    return readFileSync(stopTimesPath, 'utf-8');
  }
  return '';
}

/**
 * Worker main function - processes a chunk of stops
 */
async function processStopsChunk() {
  const { 
    stopsChunk,
    stopTimesByStopDir,
    routesCsv,
    tripsCsv,
    calendarCsv,
    distDir,
    agencyId,
    childrenByParent
  } = workerData;
  
  // Initialize Rust WASM with cached routes/trips/calendar data (ONCE per worker)
  init_routes_and_trips(routesCsv, tripsCsv);
  init_calendar(calendarCsv);
  
  const results = [];
  
  for (const stop of stopsChunk) {
    try {
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
      
      // Get child stops from pre-built map
      const childStops = childrenByParent[stopId] || [];
      
      // Load stop times CSV on-demand from split files
      const stopTimesCsv = loadStopTimesCsv(stopTimesByStopDir, stopId);
      let routeTypes = new Set();
      
      if (stopTimesCsv) {
        // Use Rust WASM to extract route types (uses cached routes/trips data)
        const routeTypesJson = extract_stop_route_types(stopTimesCsv);
        const routeTypesArray = JSON.parse(routeTypesJson);
        routeTypes = new Set(routeTypesArray);
      }
      
      // Process parent stop (NO CSV PARAMETERS - uses cached data!)
      const parentFilePath = await processStop(
        stopId, stopName, '', '', childStops,
        stopTimesCsv,
        distDir, agencyId
      );
      
      // Process child stops and collect route types
      const childLogEntries = [];
      const allRouteTypes = new Set(routeTypes);
      let childrenProcessed = 0;
      
      for (const childStop of childStops) {
        // Load child stop times CSV on-demand
        const childStopTimesCsv = loadStopTimesCsv(stopTimesByStopDir, childStop.id);
        let childRouteTypes = new Set();
        
        if (childStopTimesCsv) {
          const childRouteTypesJson = extract_stop_route_types(childStopTimesCsv);
          const childRouteTypesArray = JSON.parse(childRouteTypesJson);
          childRouteTypes = new Set(childRouteTypesArray);
          
          // Add child's route types to parent's collection
          for (const rt of childRouteTypes) {
            allRouteTypes.add(rt);
          }
        }
        
        const childFilePath = await processStop(
          childStop.id, childStop.name, stopId, stopName, [],
          childStopTimesCsv,
          distDir, agencyId
        );
        
        childLogEntries.push(`  ↳ [child] "${childStop.name}" (${childStop.id}) → ${childFilePath}`);
        childrenProcessed++;
      }
      
      // Format route types for display
      const routeTypeNames = Array.from(allRouteTypes)
        .map(rt => ROUTE_TYPE_NAMES[rt] || `Type ${rt}`)
        .join(', ');
      const routeTypeDisplay = allRouteTypes.size > 0 ? `[${routeTypeNames}]` : '[No routes]';
      
      // Collect result for main thread
      results.push({
        stopId,
        stopName,
        stopType,
        locationType,
        routeTypeDisplay,
        parentFilePath,
        childLogEntries,
        childrenCount: childStops.length,
        childrenProcessed,
        allRouteTypes: Array.from(allRouteTypes),
        hasRoutes: allRouteTypes.size > 0
      });
      
    } catch (error) {
      results.push({
        stopId: stop.stop_id,
        error: error.message
      });
    }
  }
  
  // Send results back to main thread
  parentPort.postMessage({ success: true, results });
}

// Start processing
processStopsChunk().catch(error => {
  parentPort.postMessage({ success: false, error: error.message });
});
