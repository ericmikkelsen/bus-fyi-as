// Component-Based Generator - JavaScript handles all data processing, WASM generates small HTML components
// This is the proven architecture that works reliably without ESM bindings issues
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { StopHeader, TerminalsList, HourHeader } from '../dist/release.js';

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
 * Format time from 24-hour to 12-hour with AM/PM
 */
function formatTime(time24) {
  if (!time24 || time24.length < 5) return time24;
  
  const parts = time24.split(':');
  let hour = parseInt(parts[0], 10);
  const minute = parts[1];
  
  if (isNaN(hour)) return time24;
  
  // Handle times >= 24:00:00 (next day service)
  if (hour >= 24) {
    hour = hour - 24;
  }
  
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour);
  
  return `${hour12}:${minute} ${ampm}`;
}

/**
 * Get hour from time string
 */
function getHourFromTime(timeStr) {
  if (!timeStr) return 0;
  const colonIndex = timeStr.indexOf(':');
  if (colonIndex < 0) return 0;
  const hourStr = timeStr.substring(0, colonIndex);
  let hour = parseInt(hourStr, 10);
  if (isNaN(hour)) return 0;
  
  // Handle times >= 24:00:00 (next day service)
  if (hour >= 24) hour = hour - 24;
  
  return hour;
}

/**
 * Get service days from calendar
 */
function getServiceDays(calendar) {
  if (!calendar) return '';
  
  const days = [];
  if (calendar.monday === '1') days.push('Mon');
  if (calendar.tuesday === '1') days.push('Tue');
  if (calendar.wednesday === '1') days.push('Wed');
  if (calendar.thursday === '1') days.push('Thu');
  if (calendar.friday === '1') days.push('Fri');
  if (calendar.saturday === '1') days.push('Sat');
  if (calendar.sunday === '1') days.push('Sun');
  
  return days.join(', ');
}

/**
 * Process a single stop and generate HTML
 */
async function processStop(
  stopId, stopName, parentId, parentName, childStops,
  stopTimesData, routesMap, tripsMap, calendarMap,
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
    
    // Generate header using WASM (small component)
    const stopHeaderHtml = StopHeader(
      stopName,
      stopId,
      parentId || '',
      parentName || '',
      'cta' // agency ID
    );
    
    // Generate terminals list using WASM (small component)
    const childStopIds = childStops.map(c => c.id);
    const childStopNames = childStops.map(c => c.name);
    const terminalsHtml = TerminalsList(
      'cta', // agency ID
      stopId,
      childStopIds,
      childStopNames
    );
    
    // Build routes section header
    let routesSectionHeader = '';
    if (stopTimesData.length > 0 && childStops.length > 0) {
      routesSectionHeader = `\n  <h2>Routes at ${stopName}</h2>\n`;
    }
    
    // Group stop times by hour
    const hourGroups = new Map();
    
    for (const stopTime of stopTimesData) {
      const hour = getHourFromTime(stopTime.arrival_time);
      if (!hourGroups.has(hour)) {
        hourGroups.set(hour, []);
      }
      hourGroups.get(hour).push(stopTime);
    }
    
    // Sort hours
    const hours = Array.from(hourGroups.keys()).sort((a, b) => a - b);
    
    // Build schedule HTML
    let scheduleHtml = '';
    
    for (const hour of hours) {
      const stopTimesForHour = hourGroups.get(hour);
      
      // Sort by time
      stopTimesForHour.sort((a, b) => a.arrival_time.localeCompare(b.arrival_time));
      
      // Generate hour header using WASM (small component)
      const hourHeaderHtml = HourHeader(hour);
      scheduleHtml += hourHeaderHtml;
      
      // Group by route+headsign+time to collect service days
      const entryMap = new Map();
      
      for (const stopTime of stopTimesForHour) {
        const trip = tripsMap.get(stopTime.trip_id);
        if (!trip) continue;
        
        const route = routesMap.get(trip.route_id);
        if (!route) continue;
        
        const routeName = route.route_short_name || route.route_long_name || 'Unknown';
        const headsign = trip.trip_headsign || '';
        const time = formatTime(stopTime.arrival_time);
        
        const key = `${time}|${routeName}|${headsign}`;
        
        if (!entryMap.has(key)) {
          entryMap.set(key, {
            time,
            routeName,
            headsign,
            serviceDaysSet: new Set()
          });
        }
        
        // Add service days
        const calendar = calendarMap.get(trip.service_id);
        if (calendar) {
          const serviceDays = getServiceDays(calendar);
          if (serviceDays) {
            entryMap.get(key).serviceDaysSet.add(serviceDays);
          }
        }
      }
      
      // Build schedule entries HTML
      scheduleHtml += '    <ol>\n';
      
      for (const entry of entryMap.values()) {
        const serviceDaysArray = Array.from(entry.serviceDaysSet);
        const serviceDaysStr = serviceDaysArray.join(', ');
        
        scheduleHtml += `      <li>\n`;
        scheduleHtml += `        <time datetime="${entry.time}">${entry.time}</time> - ${entry.routeName}`;
        if (entry.headsign) {
          scheduleHtml += ` to ${entry.headsign}`;
        }
        if (serviceDaysStr) {
          scheduleHtml += ` (${serviceDaysStr})`;
        }
        scheduleHtml += `\n      </li>\n`;
      }
      
      scheduleHtml += '    </ol>\n';
    }
    
    // Assemble complete HTML document
    const htmlParts = [
      '<!DOCTYPE html>\n',
      '<html lang="en">\n',
      '<head>\n',
      '  <meta charset="UTF-8">\n',
      `  <title>${stopName} - Stop ${stopId}</title>\n`,
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n',
      '</head>\n',
      '<body>\n',
      stopHeaderHtml,
      '\n',
      terminalsHtml,
      '\n',
      routesSectionHeader,
      scheduleHtml,
      '</body>\n',
      '</html>\n'
    ];
    
    const html = htmlParts.join('');
    
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
  console.log('Starting stop page generation...\n');
  
  const dataDir = join(rootDir, 'data', 'cta');
  const distDir = join(rootDir, 'dist');
  
  // Split stop_times if needed
  await splitStopTimes(dataDir);
  
  console.log('WASM functions loaded from ES module\n');
  
  // Load GTFS data
  console.log('Loading GTFS data...');
  
  const stopsPath = join(dataDir, 'stops.txt');
  const routesPath = join(dataDir, 'routes.txt');
  const tripsPath = join(dataDir, 'trips.txt');
  const calendarPath = join(dataDir, 'calendar.txt');
  
  const stopsData = parseCSV(readFileSync(stopsPath, 'utf-8'));
  const routesData = parseCSV(readFileSync(routesPath, 'utf-8'));
  const tripsData = parseCSV(readFileSync(tripsPath, 'utf-8'));
  const calendarData = parseCSV(readFileSync(calendarPath, 'utf-8'));
  
  console.log(`✅ Loaded ${stopsData.length} stops`);
  console.log(`✅ Loaded ${routesData.length} routes`);
  console.log(`✅ Loaded ${tripsData.length} trips`);
  console.log(`✅ Loaded ${calendarData.length} calendar entries\n`);
  
  // Build Maps for fast lookups
  const routesMap = new Map();
  for (const route of routesData) {
    routesMap.set(route.route_id, route);
  }
  
  const tripsMap = new Map();
  for (const trip of tripsData) {
    tripsMap.set(trip.trip_id, trip);
  }
  
  const calendarMap = new Map();
  for (const calendar of calendarData) {
    calendarMap.set(calendar.service_id, calendar);
  }
  
  // Organize stops by parent-child relationships
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
      
      // Load stop times
      const stopTimesPath = join(stopTimesByStopDir, `${stopId}-stop_times.csv`);
      let stopTimesData = [];
      
      if (existsSync(stopTimesPath)) {
        stopTimesData = parseCSV(readFileSync(stopTimesPath, 'utf-8'));
      }
      
      // Process parent stop
      await processStop(
        stopId, stopName, '', '', childStops,
        stopTimesData, routesMap, tripsMap, calendarMap,
        distDir
      );
      
      // Process child stops
      for (const childStop of childStops) {
        const childStopTimesPath = join(stopTimesByStopDir, `${childStop.id}-stop_times.csv`);
        let childStopTimesData = [];
        
        if (existsSync(childStopTimesPath)) {
          childStopTimesData = parseCSV(readFileSync(childStopTimesPath, 'utf-8'));
        }
        
        await processStop(
          childStop.id, childStop.name, stopId, stopName, [],
          childStopTimesData, routesMap, tripsMap, calendarMap,
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
