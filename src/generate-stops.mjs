// Stop Pages Generator - Creates HTML pages for each stop
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  loadGTFSData,
  getAgencies,
  formatTime,
  groupStopTimesByHour
} from './gtfs-parser.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

/**
 * Generate HTML for a stop schedule
 */
function generateStopHTML(stop, stopTimes, routes, trips) {
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
  
  // Generate HTML
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${stop.stop_name}</title>
</head>
<body>
  <h1>${stop.stop_name}</h1>
  <p>Stop ID: ${stop.stop_id}</p>
`;

  // Generate schedule by hour
  const hours = Object.keys(timesByHour).map(Number).sort((a, b) => a - b);
  
  for (const hour of hours) {
    const times = timesByHour[hour];
    
    // Format hour header
    let displayHour = hour;
    if (hour >= 24) {
      displayHour = hour - 24;
    }
    const period = displayHour >= 12 ? 'PM' : 'AM';
    const hourDisplay = displayHour === 0 ? 12 : (displayHour > 12 ? displayHour - 12 : displayHour);
    
    html += `\n  <h3>${hourDisplay}:00 ${period}</h3>\n`;
    html += `  <ol>\n`;
    
    for (const stopTime of times) {
      const trip = tripToRoute[stopTime.trip_id];
      const route = trip ? routeMap[trip.route_id] : null;
      
      const routeName = route ? 
        (route.route_short_name || route.route_long_name) : 
        'Unknown Route';
      
      const time = formatTime(stopTime.arrival_time);
      const headsign = trip?.trip_headsign || '';
      
      html += `    <li>${time} - ${routeName}`;
      if (headsign) {
        html += ` to ${headsign}`;
      }
      html += `</li>\n`;
    }
    
    html += `  </ol>\n`;
  }
  
  html += `</body>
</html>`;
  
  return html;
}

/**
 * Generate stop pages for an agency
 */
async function generateStopPages() {
  console.log('Generating stop pages from GTFS data...');
  
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
    
    // Generate page for each stop
    for (const stop of gtfsData.stops) {
      const stopTimes = stopTimesMap[stop.stop_id] || [];
      
      if (stopTimes.length === 0) {
        // Skip stops with no scheduled times
        continue;
      }
      
      const html = generateStopHTML(stop, stopTimes, gtfsData.routes, gtfsData.trips);
      
      // Create directory structure
      const stopDir = join(distDir, 'stops', stop.stop_id);
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
