// Generate CSV files for each stop containing their stop times data
// This data can be used in service workers for client-side stop list generation

import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { createInterface } from 'readline';

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
 * Simple CSV parser
 */
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(',');
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j];
    }
    data.push(obj);
  }
  
  return data;
}

/**
 * Generate CSV data for a stop
 * Format: time,route_short_name,route_long_name,trip_headsign
 */
function generateStopCsvData(stopId, stopTimesCsv, routesMap, tripsMap) {
  if (!stopTimesCsv) {
    return 'time,route_short_name,route_long_name,trip_headsign\n';
  }

  const stopTimesData = parseCSV(stopTimesCsv);
  const csvLines = ['time,route_short_name,route_long_name,trip_headsign'];

  for (const stopTime of stopTimesData) {
    const tripId = stopTime.trip_id;
    const arrivalTime = stopTime.arrival_time || '';
    
    if (!tripId) continue;

    // Get trip info
    const trip = tripsMap.get(tripId);
    if (!trip) continue;

    // Get route info
    const route = routesMap.get(trip.route_id);
    if (!route) continue;

    // Format: time,route_short_name,route_long_name,trip_headsign
    const routeShortName = route.route_short_name || '';
    const routeLongName = route.route_long_name || '';
    const tripHeadsign = trip.trip_headsign || '';
    
    // Escape commas in fields by wrapping in quotes if needed
    const escapeField = (field) => {
      if (field.includes(',') || field.includes('"')) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    };

    csvLines.push(
      `${escapeField(arrivalTime)},${escapeField(routeShortName)},${escapeField(routeLongName)},${escapeField(tripHeadsign)}`
    );
  }

  return csvLines.join('\n') + '\n';
}

/**
 * Main function to generate CSV files for all stops
 */
async function generateStopCsvs() {
  console.log('🚀 Starting stop CSV generation...\n');
  const startTime = Date.now();

  // Get agency from env var or scan data directory
  const agency = process.env.AGENCY;
  const baseDataDir = join(rootDir, 'data');
  
  let agencies = [];
  if (agency) {
    // Use specified agency
    agencies = [agency];
    console.log(`Using agency from AGENCY env var: ${agency}\n`);
  } else {
    // Scan data directory for agencies
    if (!existsSync(baseDataDir)) {
      console.error('❌ data directory not found!');
      process.exit(1);
    }
    
    const entries = readdirSync(baseDataDir, { withFileTypes: true });
    agencies = entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => entry.name);
    
    if (agencies.length === 0) {
      console.error('❌ No agency directories found in data/');
      process.exit(1);
    }
    
    console.log(`Found ${agencies.length} agency(ies): ${agencies.join(', ')}\n`);
  }
  
  // Process each agency
  for (const agencyName of agencies) {
    console.log(`\n📂 Processing agency: ${agencyName}`);
    console.log('='.repeat(50));
    
    await generateStopCsvsForAgency(agencyName);
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ All CSV generation complete! Total time: ${elapsed}s\n`);
}

/**
 * Generate CSV files for a specific agency
 */
async function generateStopCsvsForAgency(agencyName) {
  const agencyStartTime = Date.now();
  const dataDir = join(rootDir, 'data', agencyName);
  const stopTimesByStopDir = join(dataDir, 'stop_times_by_stop');
  const distDir = join(rootDir, 'dist');

  // Check if split stop_times files exist, if not, split them
  if (!existsSync(stopTimesByStopDir)) {
    console.log('stop_times_by_stop directory not found, splitting now...\n');
    await splitStopTimes(dataDir);
  }

  // Load routes and trips data
  console.log('Loading GTFS data...');
  const routesCsv = readFileSync(join(dataDir, 'routes.txt'), 'utf-8');
  const tripsCsv = readFileSync(join(dataDir, 'trips.txt'), 'utf-8');
  const stopsCsv = readFileSync(join(dataDir, 'stops.txt'), 'utf-8');

  const routesData = parseCSV(routesCsv);
  const tripsData = parseCSV(tripsCsv);
  const stopsData = parseCSV(stopsCsv);

  // Build maps for quick lookups
  const routesMap = new Map();
  for (const route of routesData) {
    routesMap.set(route.route_id, route);
  }

  const tripsMap = new Map();
  for (const trip of tripsData) {
    tripsMap.set(trip.trip_id, trip);
  }

  console.log(`✅ Loaded ${routesData.length} routes`);
  console.log(`✅ Loaded ${tripsData.length} trips`);
  console.log(`✅ Loaded ${stopsData.length} stops\n`);

  // Get list of all stop_times files
  const stopTimesFiles = readdirSync(stopTimesByStopDir).filter(f => f.endsWith('-stop_times.csv'));
  console.log(`Found ${stopTimesFiles.length} stops to process\n`);

  let processed = 0;
  let filesGenerated = 0;
  const batchSize = 500;

  for (let i = 0; i < stopTimesFiles.length; i += batchSize) {
    const batch = stopTimesFiles.slice(i, i + batchSize);

    await Promise.all(batch.map(async (file) => {
      const stopId = file.replace('-stop_times.csv', '');
      
      // Find stop in stops data to determine path
      const stop = stopsData.find(s => s.stop_id === stopId);
      if (!stop) {
        return; // Skip if stop not found
      }

      // Determine output directory based on parent/child relationship
      let outputDir;
      if (stop.parent_station && stop.parent_station !== '') {
        // Child stop - place in parent's directory
        outputDir = join(distDir, agencyName, 'stops', stop.parent_station, stopId);
      } else {
        // Parent or standalone stop
        outputDir = join(distDir, agencyName, 'stops', stopId);
      }

      // Check if HTML file exists in this directory (only generate CSV if HTML exists)
      const indexPath = join(outputDir, 'index.html');
      if (!existsSync(indexPath)) {
        return; // Skip if no HTML page was generated for this stop
      }

      // Load stop times data
      const stopTimesCsv = readFileSync(join(stopTimesByStopDir, file), 'utf-8');

      // Generate CSV data
      const csvData = generateStopCsvData(stopId, stopTimesCsv, routesMap, tripsMap);

      // Ensure output directory exists
      mkdirSync(outputDir, { recursive: true });

      // Write CSV file
      const csvPath = join(outputDir, 'data.csv');
      const writeStream = createWriteStream(csvPath);
      
      // Create readable stream from string and pipe to file
      const readable = Readable.from([csvData]);
      await pipeline(readable, writeStream);

      filesGenerated++;
    }));

    processed += batch.length;
    const percent = Math.round((processed / stopTimesFiles.length) * 100);
    const elapsed = ((Date.now() - agencyStartTime) / 1000).toFixed(1);
    const rate = (filesGenerated / (elapsed / 60)).toFixed(1);

    console.log(`[${percent}%] Processed ${processed}/${stopTimesFiles.length} stops (${filesGenerated} CSVs generated, ${rate} files/min, ${elapsed}s elapsed)`);
  }

  const totalTime = ((Date.now() - agencyStartTime) / 1000).toFixed(1);
  console.log(`\n✅ CSV generation complete for ${agencyName}!`);
  console.log(`   Generated ${filesGenerated} data.csv files`);
  console.log(`   Total time: ${totalTime}s`);
  console.log(`   Average: ${(filesGenerated / (totalTime / 60)).toFixed(1)} files/min`);
}

// Run the generator
generateStopCsvs().catch(error => {
  console.error('❌ Error generating stop CSVs:', error);
  process.exit(1);
});
