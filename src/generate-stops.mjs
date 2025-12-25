// Maximum Performance Generator - Uses streaming for large files + AssemblyScript
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { cpus } from 'os';
import { getAgencies } from './modules/gtfs-parser-fast.mjs';
import { streamParseStopTimes, streamParseGTFS, getLineCount, splitStopTimesByStopAndRoute } from './modules/streaming-gtfs-parser.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const NUM_WORKERS = cpus().length;

/**
 * Write file using streams with Buffer
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
 * Format GTFS time string to readable format in JavaScript
 * @param {string} gtfsTime - Time in GTFS format (HH:MM:SS, can be > 24 for times past midnight)
 * @returns {{formatted: string, datetime: string}} - Formatted time and ISO datetime
 */
function formatTime(gtfsTime) {
  if (!gtfsTime || gtfsTime.length === 0) {
    return { formatted: '--:--', datetime: '00:00' };
  }
  
  // Parse time (HH:MM:SS format)
  const parts = gtfsTime.split(':');
  if (parts.length < 2) {
    return { formatted: gtfsTime, datetime: '00:00' };
  }
  
  let hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);
  
  if (isNaN(hour) || isNaN(minute)) {
    return { formatted: gtfsTime, datetime: '00:00' };
  }
  
  // Handle times past midnight (25:00 = 1:00 AM next day)
  let displayHour = hour;
  if (hour >= 24) {
    displayHour = hour - 24;
  }
  
  // Determine AM/PM
  let period = 'AM';
  if (displayHour >= 12) {
    period = 'PM';
    if (displayHour > 12) {
      displayHour = displayHour - 12;
    }
  }
  
  if (displayHour === 0) {
    displayHour = 12;
  }
  
  // Format minute with leading zero
  const minuteFormatted = minute < 10 ? '0' + minute : minute.toString();
  
  // Build ISO time for datetime attribute
  let isoHour = hour;
  if (isoHour >= 24) {
    isoHour = isoHour - 24;
  }
  const isoHourStr = isoHour < 10 ? '0' + isoHour : isoHour.toString();
  const datetime = isoHourStr + ':' + minuteFormatted;
  
  const formatted = displayHour + ':' + minuteFormatted + ' ' + period;
  
  return { formatted, datetime };
}

function formatHourDisplay(hour) {
  let displayHour = hour;
  if (hour >= 24) {
    displayHour = hour - 24;
  }
  
  const period = displayHour >= 12 ? 'PM' : 'AM';
  let hourDisplay = displayHour;
  if (displayHour > 12) {
    hourDisplay = displayHour - 12;
  } else if (displayHour === 0) {
    hourDisplay = 12;
  }
  
  return hourDisplay + ':00 ' + period;
}


/**
 * Load CSV file and let WASM parse it
 */
function loadCSVForWASM(filePath) {
  if (!existsSync(filePath)) {
    return '';
  }
  return readFileSync(filePath, 'utf-8');
}

/**
 * Process a single stop using WASM for all logic
 * Reads from pre-split stop_times files to avoid large array processing
 */
async function processStopWithWASM(
  stopId, stopName, parentId, parentName, childStopData,
  agency, agencyPath, routeMap, tripMap, calendarMap,
  wasmModule, distDir
) {
  // Read stop-specific stop_times from split file (much smaller dataset)
  const stopTimesFilePath = join(agencyPath, 'stop_times_by_stop', `${stopId}-stop_times.csv`);
  let stopTimesForThisStop = [];
  
  if (existsSync(stopTimesFilePath)) {
    const content = readFileSync(stopTimesFilePath, 'utf-8');
    stopTimesForThisStop = parseCSVInJS(content);
  }
  
  // Prepare stop directory with agency prefix
  // Child stops: /[agency]/stops/[parent_id]/[stop_id]/index.html
  // Parent/regular stops: /[agency]/stops/[stop_id]/index.html
  let stopDir;
  if (parentId) {
    // This is a child stop - create nested path
    stopDir = join(distDir, agency, 'stops', parentId, stopId);
  } else {
    // This is a parent or regular stop
    stopDir = join(distDir, agency, 'stops', stopId);
  }
  
  if (!existsSync(stopDir)) {
    mkdirSync(stopDir, { recursive: true });
  }
  
  // Prepare all data in JavaScript, then make ONE WASM call for entire page
  // This minimizes JavaScript/WASM boundary crossings for better performance
  
  // 1. Prepare terminal data
  const childStopIds = childStopData.map(c => c.id);
  const childStopNames = childStopData.map(c => c.name);
  
  // 2. Process schedule data - group, deduplicate, add service days
  const arrivalTimes = stopTimesForThisStop.map(st => st.arrival_time);
  const tripIds = stopTimesForThisStop.map(st => st.trip_id);
  
  function getHourFromTime(timeStr) {
    if (!timeStr || timeStr.length === 0) return 0;
    const colonIndex = timeStr.indexOf(':');
    if (colonIndex < 0) return 0;
    const hourStr = timeStr.substring(0, colonIndex);
    const hour = parseInt(hourStr, 10);
    return isNaN(hour) ? 0 : hour;
  }
  
  // Group stop times by hour
  const hoursSet = new Set();
  for (let i = 0; i < arrivalTimes.length; i++) {
    hoursSet.add(getHourFromTime(arrivalTimes[i]));
  }
  const hours = Array.from(hoursSet).sort((a, b) => a - b);
  
  // Prepare deduplicated data for each hour using FLATTENED arrays
  // This avoids 2D array memory issues in AssemblyScript
  const hourDisplays = [];
  const hourStartIndices = [];
  const flatFormattedTimes = [];
  const flatDatetimes = [];
  const flatRouteNames = [];
  const flatHeadsigns = [];
  const flatServiceDays = [];
  
  for (let i = 0; i < hours.length; i++) {
    const hour = hours[i];
    
    // Record start index for this hour
    hourStartIndices.push(flatFormattedTimes.length);
    
    // Filter stop times for this hour
    const indicesForHour = [];
    for (let j = 0; j < arrivalTimes.length; j++) {
      if (getHourFromTime(arrivalTimes[j]) === hour) {
        indicesForHour.push(j);
      }
    }
    
    // Sort by arrival time
    const sortedIndices = indicesForHour.sort((a, b) => {
      return arrivalTimes[a].localeCompare(arrivalTimes[b]);
    });
    
    // Deduplicate by time+route+headsign and collect service days
    const entryMap = new Map(); // key: "time|route|headsign", value: { time, route, headsign, serviceDays: Set }
    
    for (let j = 0; j < sortedIndices.length; j++) {
      const idx = sortedIndices[j];
      const stopTime = stopTimesForThisStop[idx];
      const tripId = tripIds[idx];
      
      // Fast lookup using Maps
      const trip = tripMap.get(tripId);
      const route = trip ? routeMap.get(trip.route_id) : null;
      const calendar = trip ? calendarMap.get(trip.service_id) : null;
      
      const routeName = route ? (route.route_short_name || route.route_long_name) : 'Unknown';
      const time = stopTime.arrival_time;  // Keep GTFS format, WASM will format it
      const headsign = trip?.trip_headsign || '';
      
      const key = `${time}|${routeName}|${headsign}`;
      
      if (!entryMap.has(key)) {
        entryMap.set(key, {
          time,
          routeName,
          headsign,
          serviceDaysSet: new Set()
        });
      }
      
      // Add service days from calendar
      if (calendar && calendar._serviceDays) {
        const daysArray = calendar._serviceDays.split(', ');
        for (const day of daysArray) {
          entryMap.get(key).serviceDaysSet.add(day);
        }
      }
    }
    
    // Convert deduplicated entries to FLATTENED arrays, FORMAT TIMES IN JAVASCRIPT
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    for (const entry of entryMap.values()) {
      // Format time in JavaScript (no string operations in WASM!)
      const timeFormatted = formatTime(entry.time);
      flatFormattedTimes.push(timeFormatted.formatted);
      flatDatetimes.push(timeFormatted.datetime);
      
      flatRouteNames.push(entry.routeName);
      flatHeadsigns.push(entry.headsign);
      
      // Convert service days Set to sorted, comma-separated string
      const serviceDaysArray = Array.from(entry.serviceDaysSet).sort((a, b) => {
        return dayOrder.indexOf(a) - dayOrder.indexOf(b);
      });
      flatServiceDays.push(serviceDaysArray.join(', '));
    }
    
    // Format hour display in JavaScript (no string operations in WASM!)
    hourDisplays.push(formatHourDisplay(hour));
  }
  
  // 3. Build HTML in JavaScript
  // After extensive testing, JavaScript is better for string-heavy HTML generation
  // WASM is great for computation but creates memory pressure with string concatenation
  let html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n';
  html += '  <meta charset="UTF-8">\n';
  html += '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
  html += '  <title>' + stopName + '</title>\n';
  html += '</head>\n<body>\n';
  
  // Stop header
  html += '<h1>' + stopName + '</h1>\n';
  if (parentId && parentName) {
    html += '<p><a href="/' + agency + '/stops/' + parentId + '/">← Back to ' + parentName + '</a></p>\n';
  }
  html += '<p>Stop ID: ' + stopId + '</p>\n';
  
  // Terminals list
  if (childStopIds.length > 0) {
    html += '<h2>Terminals</h2>\n<ul>\n';
    for (let i = 0; i < childStopIds.length; i++) {
      html += '  <li><a href="/' + agency + '/stops/' + stopId + '/' + childStopIds[i] + '/">' + childStopNames[i] + '</a></li>\n';
    }
    html += '</ul>\n';
  }
  
  // Routes section
  if (hourDisplays.length > 0) {
    html += '<h2>Routes at ' + stopName + '</h2>\n';
    
    // Build schedule for each hour
    for (let i = 0; i < hourDisplays.length; i++) {
      const startIdx = hourStartIndices[i];
      const endIdx = (i + 1 < hourStartIndices.length) ? hourStartIndices[i + 1] : flatFormattedTimes.length;
      
      html += '<h3>' + hourDisplays[i] + '</h3>\n';
      html += '<ol>\n';
      
      for (let j = startIdx; j < endIdx; j++) {
        html += '  <li><time datetime="' + flatDatetimes[j] + '">' + flatFormattedTimes[j] + '</time> - ' + flatRouteNames[j];
        if (flatHeadsigns[j]) {
          html += ' to ' + flatHeadsigns[j];
        }
        if (flatServiceDays[j]) {
          html += ' ' + flatServiceDays[j];
        }
        html += '</li>\n';
      }
      
      html += '</ol>\n';
    }
  }
  
  html += '</body>\n</html>';
  
  // Generate CSV with service days using WASM
  const csvLines = ['arrival_time,route_short_name,route_long_name,headsign,service_days'];
  
  for (let i = 0; i < stopTimesForThisStop.length; i++) {
    const stopTime = stopTimesForThisStop[i];
    const trip = tripMap.get(stopTime.trip_id);
    const route = trip ? routeMap.get(trip.route_id) : null;
    const calendar = trip ? calendarMap.get(trip.service_id) : null;
    
    if (route && calendar) {
      const routeShort = (route.route_short_name || '').replace(/,/g, ' ');
      const routeLong = (route.route_long_name || '').replace(/,/g, ' ');
      const headsign = (trip.trip_headsign || '').replace(/,/g, ' ');
      
      // Use pre-computed service days string
      const serviceDays = calendar._serviceDays;
      
      csvLines.push(`${stopTime.arrival_time},${routeShort},${routeLong},${headsign},${serviceDays}`);
    }
  }
  
  const csvBuffer = Buffer.from(csvLines.join('\n'));
  
  // Write both files
  await Promise.all([
    writeFileStreamFast(join(stopDir, 'index.html'), Buffer.from(html)),
    writeFileStreamFast(join(stopDir, 'schedule.csv'), csvBuffer)
  ]);
}

/**
 * Parse CSV in JavaScript (not WASM) to avoid string memory pressure
 * JavaScript handles strings natively without reference counting
 * Handles quoted fields with commas properly
 */
function parseCSVInJS(content) {
  if (!content || content.trim().length === 0) {
    return [];
  }
  
  const lines = content.trim().split('\n');
  if (lines.length === 0) return [];
  
  // Parse a single CSV line handling quoted fields
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // Push the last field
    result.push(current.trim());
    return result;
  }
  
  // Parse header
  const headers = parseCSVLine(lines[0]);
  
  // Parse rows
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    
    const values = parseCSVLine(line);
    const record = {};
    
    // Ensure we handle rows with fewer columns than headers
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = (j < values.length) ? values[j] : '';
    }
    
    records.push(record);
  }
  
  return records;
}

/**
 * Format time from HH:MM:SS to readable format in JavaScript
 * This avoids WASM issues with malformed data
 */
function formatTimeInJS(timeStr) {
  if (!timeStr || timeStr.trim().length === 0) return '';
  
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  
  const hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  
  if (isNaN(hours)) return timeStr;
  
  // Handle times >= 24:00:00 (next day service)
  let displayHours = hours >= 24 ? hours - 24 : hours;
  
  const period = displayHours >= 12 ? 'PM' : 'AM';
  if (displayHours === 0) {
    displayHours = 12;
  } else if (displayHours > 12) {
    displayHours = displayHours - 12;
  }
  
  return `${displayHours}:${minutes} ${period}`;
}

/**
 * Format elapsed time for logging
 */
function formatElapsedTime(ms) {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}m ${secs}s`;
}

/**
 * Log progress for long-running loops
 */
function logProgress(current, total, label, startTime) {
  const percent = ((current / total) * 100).toFixed(1);
  const elapsed = Date.now() - startTime;
  const rate = current / (elapsed / 1000);
  const eta = ((total - current) / rate) * 1000;
  
  console.log(`    ${label}: ${current}/${total} (${percent}%) - ${rate.toFixed(0)}/sec - ETA: ${formatElapsedTime(eta)}`);
}

/**
 * Generate stop pages with maximum WASM usage
 */
async function generateStopPages() {
  console.log('🚀 Maximum Performance Generator (WASM-powered)');
  console.log(`💪 Using ${NUM_WORKERS} CPU cores + AssemblyScript`);
  
  // Load WASM module using ESM bindings (handles string memory automatically)
  console.log('⚡ Loading AssemblyScript module with ESM bindings...');
  const wasmLoadStart = Date.now();
  
  // Use generated ESM wrapper
  const wasmModule = await import(join(rootDir, 'dist', 'release.js'));
  
  console.log(`  ✓ WASM loaded with ESM bindings in ${((Date.now() - wasmLoadStart) / 1000).toFixed(2)}s`);
  
  const dataDir = join(rootDir, 'data');
  // Use public directory so Vite includes generated files in build
  // Vite automatically serves public/ in dev and includes it in dist/ during build
  const distDir = join(rootDir, 'public');
  
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }
  
  const agencies = getAgencies(dataDir);
  
  if (agencies.length === 0) {
    console.log('⚠ No agencies found. Run `npm run download:gtfs` to download CTA data.');
    return;
  }
  
  console.log(`📊 Found ${agencies.length} ${agencies.length === 1 ? 'agency' : 'agencies'}: ${agencies.join(', ')}`);
  
  let totalStops = 0;
  const startTime = Date.now();
  
  for (const agency of agencies) {
    const agencyPath = join(dataDir, agency);
    console.log(`\n📍 Processing ${agency}...`);
    
    const parseStart = Date.now();
    
    // Parse smaller files using WASM (fast and efficient)
    console.log('  🔧 Parsing CSV files...');
    const csvParseStart = Date.now();
    
    const stopsContent = loadCSVForWASM(join(agencyPath, 'stops.txt'));
    const stops = parseCSVInJS(stopsContent);
    console.log(`    ✓ stops.txt (${stops.length} rows) - ${((Date.now() - csvParseStart) / 1000).toFixed(2)}s`);
    
    const routesParseStart = Date.now();
    const routesContent = loadCSVForWASM(join(agencyPath, 'routes.txt'));
    const routes = parseCSVInJS(routesContent);
    console.log(`    ✓ routes.txt (${routes.length} rows) - ${((Date.now() - routesParseStart) / 1000).toFixed(2)}s`);
    
    const tripsParseStart = Date.now();
    const tripsContent = loadCSVForWASM(join(agencyPath, 'trips.txt'));
    const trips = parseCSVInJS(tripsContent);
    console.log(`    ✓ trips.txt (${trips.length} rows) - ${((Date.now() - tripsParseStart) / 1000).toFixed(2)}s`);
    
    const calendarParseStart = Date.now();
    const calendarContent = loadCSVForWASM(join(agencyPath, 'calendar.txt'));
    const calendar = parseCSVInJS(calendarContent);
    console.log(`    ✓ calendar.txt (${calendar.length} rows) - ${((Date.now() - calendarParseStart) / 1000).toFixed(2)}s`);
    
    // Stream parse stop_times.txt (can be 300MB+, millions of rows)
    // Split into smaller files by stop and route to prevent WASM memory issues
    console.log('  🌊 Processing stop_times.txt (large file)...');
    const stopTimesFile = join(agencyPath, 'stop_times.txt');
    const tripsFile = join(agencyPath, 'trips.txt');
    const stopTimesLineCount = await getLineCount(stopTimesFile);
    console.log(`    Expected ~${stopTimesLineCount.toLocaleString()} lines`);
    
    const stopTimesParseStart = Date.now();
    let lastProgressTime = Date.now();
    
    // Split stop_times into separate files by stop and route
    await splitStopTimesByStopAndRoute(stopTimesFile, tripsFile, agencyPath, (processed, total) => {
      const now = Date.now();
      if (now - lastProgressTime >= 5000) { // Progress every 5 seconds
        const percent = ((processed / total) * 100).toFixed(1);
        const rate = processed / ((now - stopTimesParseStart) / 1000);
        const eta = ((total - processed) / rate) * 1000;
        console.log(`    Splitting: ${processed.toLocaleString()}/${total.toLocaleString()} (${percent}%) - ${rate.toFixed(0)}/sec - ETA: ${formatElapsedTime(eta)}`);
        lastProgressTime = now;
      }
    });
    
    console.log(`    ✓ stop_times.txt split by stop and route - ${((Date.now() - stopTimesParseStart) / 1000).toFixed(2)}s`);
    
    const parseTime = ((Date.now() - parseStart) / 1000).toFixed(2);
    
    if (stops.length === 0) {
      console.log('  ⚠ No stops found');
      continue;
    }
    
    console.log(`  ✅ All CSV parsed in ${((Date.now() - parseStart) / 1000).toFixed(2)}s`);
    
    // Build parent-child relationships
    console.log('  🔗 Building stop relationships...');
    const indexStart = Date.now();
    
    // Build parent-child relationships in JavaScript
    // (AssemblyScript Map is not directly accessible from JavaScript -
    // WASM only exports primitive types and typed arrays, not complex objects)
    const childrenMap = {};
    const stopMap = {};
    const parentMap = {};
    
    for (const stop of stops) {
      stopMap[stop.stop_id] = stop;
      
      // Build children map
      if (stop.parent_station && stop.parent_station.trim() !== '') {
        const parentId = stop.parent_station;
        if (!childrenMap[parentId]) {
          childrenMap[parentId] = [];
        }
        childrenMap[parentId].push(stop);
      }
    }
    
    // Build parent map
    for (const stop of stops) {
      if (stop.parent_station && stop.parent_station.trim() !== '') {
        parentMap[stop.stop_id] = stopMap[stop.parent_station];
      }
    }
    
    // Build fast lookup maps for trips and routes
    const tripMap = new Map();
    const routeMap = new Map();
    
    for (const trip of trips) {
      tripMap.set(trip.trip_id, trip);
    }
    
    for (const route of routes) {
      routeMap.set(route.route_id, route);
    }
    
    for (const cal of calendar) {
      // Pre-compute service day string for each calendar entry
      cal._serviceDays = wasmModule.getServiceDaysString(
        cal.monday, cal.tuesday, cal.wednesday,
        cal.thursday, cal.friday, cal.saturday, cal.sunday
      );
    }
    
    const calendarMap = new Map();
    for (const cal of calendar) {
      calendarMap.set(cal.service_id, cal);
    }
    
    const indexTime = ((Date.now() - indexStart) / 1000).toFixed(2);
    console.log(`  ✓ Relationships built in ${indexTime}s`);
    console.log(`  💾 Memory: ${tripMap.size} trips, ${routeMap.size} routes, ${calendarMap.size} calendars indexed`);
    
    // Process stops
    console.log(`  🔧 Generating pages with WASM...`);
    const genStart = Date.now();
    
    const promises = [];
    const stopsToProcess = [];
    
    for (const stop of stops) {
      const childStops = (childrenMap[stop.stop_id] || []).map(c => ({ id: c.stop_id, name: c.stop_name }));
      const parentStop = parentMap[stop.stop_id];
      
      // Check if stop has data - we'll check the file existence in processStopWithWASM
      stopsToProcess.push({
        stop,
        childStops,
        parentStop
      });
    }
    
    console.log(`  📄 Processing ${stopsToProcess.length} stops...`);
    
    let lastLog = Date.now();
    const processStartTime = Date.now();
    for (let i = 0; i < stopsToProcess.length; i++) {
      const { stop, childStops, parentStop } = stopsToProcess[i];
      
      // Progress logging every 60 seconds
      if (Date.now() - lastLog > 60000) {
        logProgress(i + 1, stopsToProcess.length, 'Generating pages', processStartTime);
        lastLog = Date.now();
      }
      
      promises.push(
        processStopWithWASM(
          stop.stop_id, stop.stop_name, 
          parentStop ? parentStop.stop_id : null,
          parentStop ? parentStop.stop_name : null,
          childStops, agency, agencyPath, routeMap, tripMap, calendarMap,
          wasmModule, distDir
        )
      );
      
      // Log progress every 60 seconds for large datasets
      if (stopsToProcess.length > 1000 && Date.now() - lastLog > 60000) {
        logProgress(i + 1, stopsToProcess.length, 'Generating pages', genStart);
        lastLog = Date.now();
      }
    }
    
    await Promise.all(promises);
    
    const genTime = ((Date.now() - genStart) / 1000).toFixed(2);
    totalStops += promises.length;
    
    console.log(`  ✅ Generated ${promises.length} stops in ${genTime}s (${(promises.length / genTime).toFixed(0)} pages/sec)`);
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n🎉 Complete: ${totalStops} stops in ${elapsed}s`);
  console.log(`⚡ Average: ${(totalStops / elapsed).toFixed(0)} pages/second`);
  console.log(`🚀 Hybrid JavaScript/WASM architecture for stability + performance!`);
  console.log(`📁 Output: public/stops/[stop-id]/index.html + schedule.csv`);
  console.log(`   Vite will serve these files in dev mode and include them in the build`);
}

generateStopPages().catch(console.error);
