// Stop Pages Generator - Creates HTML pages for each stop using AssemblyScript components
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  loadGTFSData,
  getAgencies,
  groupStopTimesByHour
} from './modules/gtfs-parser.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

/**
 * Generate HTML for a stop schedule using AssemblyScript components
 */
async function generateStopHTML(stop, stopTimes, routes, trips, childStops, parentStop, wasmModule) {
  // Create a map of trip_id to route info
  const tripToRoute = {};
  for (const trip of trips) {
    tripToRoute[trip.trip_id] = trip;
  }
  
  // Create a map of route_id to route info
  const routeMap = {};
  for (const route of routes) {
    routeMap[route.route_id] = route;
  }
  
  // Sort stop times by arrival time
  const sortedStopTimes = [...stopTimes].sort((a, b) => {
    return a.arrival_time.localeCompare(b.arrival_time);
  });
  
  // Group by hour
  const timesByHour = groupStopTimesByHour(sortedStopTimes);
  
  // Prepare data for AssemblyScript
  const childStopIds = childStops ? childStops.map(c => c.stop_id) : [];
  const childStopNames = childStops ? childStops.map(c => c.stop_name) : [];
  const parentStopId = parentStop ? parentStop.stop_id : '';
  const parentStopName = parentStop ? parentStop.stop_name : '';
  const hasRoutes = sortedStopTimes.length > 0;
  
  // Generate base page structure using AssemblyScript
  let html = wasmModule.generateStopPage(
    stop.stop_name,
    stop.stop_id,
    parentStopId,
    parentStopName,
    childStopIds,
    childStopNames,
    hasRoutes
  );
  
  // Add schedule using AssemblyScript components
  const hours = Object.keys(timesByHour).map(Number).sort((a, b) => a - b);
  
  // Build schedule content
  let scheduleContent = '';
  
  for (const hour of hours) {
    const times = timesByHour[hour];
    
    scheduleContent = wasmModule.addScheduleHour(scheduleContent, hour);
    
    for (const stopTime of times) {
      const trip = tripToRoute[stopTime.trip_id];
      const route = trip ? routeMap[trip.route_id] : null;
      
      const routeName = route ? 
        (route.route_short_name || route.route_long_name) : 
        'Unknown Route';
      
      const time = wasmModule.formatTime(stopTime.arrival_time);
      const headsign = trip?.trip_headsign || '';
      
      scheduleContent = wasmModule.addScheduleEntry(scheduleContent, time, routeName, headsign);
    }
    
    scheduleContent = wasmModule.closeScheduleHour(scheduleContent);
  }
  
  // Insert schedule before closing body tag
  html = html.replace('</body>', scheduleContent + '</body>');
  
  return html;
}

/**
 * Generate stop pages for an agency
 */
async function generateStopPages() {
  console.log('Generating stop pages from GTFS data using AssemblyScript...');
  
  // Load AssemblyScript WASM module
  console.log('Loading AssemblyScript module...');
  const wasmModule = await import(join(rootDir, 'dist', 'release.js'));
  
  const dataDir = join(rootDir, 'data');
  const distDir = join(rootDir, 'dist');
  
  // Ensure dist directory exists
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }
  
  // Get all agencies
  const agencies = getAgencies(dataDir);
  
  if (agencies.length === 0) {
    console.log('⚠ No agencies found in data/ directory');
    console.log('  Download GTFS data and extract to data/[agency-name]/');
    console.log('  Example: https://www.bart.gov/sites/default/files/2025-12/google_transit_20250811-20251231_v03.zip');
    return;
  }
  
  console.log(`Found ${agencies.length} ${agencies.length === 1 ? 'agency' : 'agencies'}: ${agencies.join(', ')}`);
  
  let totalStops = 0;
  
  // Process each agency
  for (const agency of agencies) {
    const agencyPath = join(dataDir, agency);
    console.log(`\nProcessing ${agency}...`);
    
    // Load GTFS data
    const gtfsData = loadGTFSData(agencyPath);
    
    if (gtfsData.stops.length === 0) {
      console.log(`  ⚠ No stops.txt found for ${agency}`);
      continue;
    }
    
    console.log(`  Loaded ${gtfsData.stops.length} stops`);
    console.log(`  Loaded ${gtfsData.routes.length} routes`);
    console.log(`  Loaded ${gtfsData.trips.length} trips`);
    console.log(`  Loaded ${gtfsData.stopTimes.length} stop times`);
    
    // Group stop times by stop_id
    const stopTimesMap = {};
    for (const stopTime of gtfsData.stopTimes) {
      if (!stopTimesMap[stopTime.stop_id]) {
        stopTimesMap[stopTime.stop_id] = [];
      }
      stopTimesMap[stopTime.stop_id].push(stopTime);
    }
    
    // Build parent-child relationships
    const stopMap = {};
    const childrenMap = {}; // parent_id -> [child stops]
    const parentMap = {}; // child_id -> parent stop
    
    for (const stop of gtfsData.stops) {
      stopMap[stop.stop_id] = stop;
      
      // Check if this stop has a parent
      if (stop.parent_station && stop.parent_station.trim() !== '') {
        const parentId = stop.parent_station;
        if (!childrenMap[parentId]) {
          childrenMap[parentId] = [];
        }
        childrenMap[parentId].push(stop);
      }
    }
    
    // Build reverse lookup for parent stations
    for (const [parentId, children] of Object.entries(childrenMap)) {
      for (const child of children) {
        parentMap[child.stop_id] = stopMap[parentId];
      }
    }
    
    // Generate page for each stop
    for (const stop of gtfsData.stops) {
      const stopTimes = stopTimesMap[stop.stop_id] || [];
      const childStops = childrenMap[stop.stop_id] || [];
      const parentStop = parentMap[stop.stop_id] || null;
      
      // Skip stops with no scheduled times AND no children (unless they have a parent)
      if (stopTimes.length === 0 && childStops.length === 0 && !parentStop) {
        continue;
      }
      
      const html = await generateStopHTML(stop, stopTimes, gtfsData.routes, gtfsData.trips, childStops, parentStop, wasmModule);
      
      // Create directory structure
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
      
      // Write HTML file
      const htmlPath = join(stopDir, 'index.html');
      writeFileSync(htmlPath, html);
      
      totalStops++;
    }
    
    console.log(`  ✓ Generated ${totalStops} stop pages`);
  }
  
  console.log(`\n✓ Total stop pages generated: ${totalStops}`);
  console.log(`✓ Stop pages available at dist/stops/[stop-id]/index.html`);
}

// Run the generator
generateStopPages().catch(console.error);
