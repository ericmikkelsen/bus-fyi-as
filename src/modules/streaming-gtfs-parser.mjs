// Streaming GTFS parser for handling large files (300MB+)
import { createReadStream, createWriteStream, mkdirSync, existsSync as fileExists } from 'fs';
import { createInterface } from 'readline';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Parse CSV line efficiently
 */
function parseCSVLine(line, columnCount) {
  const values = new Array(columnCount);
  let valueIndex = 0;
  let inQuotes = false;
  let currentValue = '';
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values[valueIndex++] = currentValue.trim();
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  
  values[valueIndex] = currentValue.trim();
  return values;
}

/**
 * Stream parse stop_times.txt and build stop-indexed map
 * This avoids loading the entire file into memory
 */
export async function streamParseStopTimes(filePath, onProgress) {
  if (!existsSync(filePath)) {
    return {};
  }
  
  return new Promise((resolve, reject) => {
    const stopTimesMap = {};
    let headers = null;
    let stopIdIndex = -1;
    let arrivalTimeIndex = -1;
    let tripIdIndex = -1;
    let lineCount = 0;
    let processedCount = 0;
    let lastProgress = Date.now();
    
    const fileStream = createReadStream(filePath, {
      encoding: 'utf-8',
      highWaterMark: 512 * 1024 // 512KB chunks for better performance
    });
    
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    rl.on('line', (line) => {
      lineCount++;
      
      if (!headers) {
        // Parse header
        headers = line.split(',').map(h => h.trim());
        stopIdIndex = headers.indexOf('stop_id');
        arrivalTimeIndex = headers.indexOf('arrival_time');
        tripIdIndex = headers.indexOf('trip_id');
        return;
      }
      
      // Parse line efficiently
      const values = parseCSVLine(line, headers.length);
      
      if (stopIdIndex >= 0 && values[stopIdIndex]) {
        const stopId = values[stopIdIndex];
        
        // Build minimal record - only fields we need
        const record = {
          stop_id: stopId,
          arrival_time: values[arrivalTimeIndex] || '',
          trip_id: values[tripIdIndex] || ''
        };
        
        if (!stopTimesMap[stopId]) {
          stopTimesMap[stopId] = [];
        }
        stopTimesMap[stopId].push(record);
        
        processedCount++;
        
        // Progress logging
        if (onProgress && Date.now() - lastProgress > 10000) { // Every 10 seconds
          onProgress(processedCount, lineCount);
          lastProgress = Date.now();
        }
      }
    });
    
    rl.on('close', () => {
      if (onProgress) {
        onProgress(processedCount, lineCount); // Final progress
      }
      resolve(stopTimesMap);
    });
    
    rl.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Stream parse any GTFS file line-by-line
 * Returns array of records
 */
export async function streamParseGTFS(filePath, onProgress) {
  if (!existsSync(filePath)) {
    return [];
  }
  
  return new Promise((resolve, reject) => {
    const records = [];
    let headers = null;
    let lineCount = 0;
    let lastProgress = Date.now();
    
    const fileStream = createReadStream(filePath, {
      encoding: 'utf-8',
      highWaterMark: 256 * 1024 // 256KB chunks
    });
    
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    rl.on('line', (line) => {
      lineCount++;
      
      if (!headers) {
        // Parse header
        headers = line.split(',').map(h => h.trim());
        return;
      }
      
      // Parse line
      const values = parseCSVLine(line, headers.length);
      const record = {};
      
      for (let j = 0; j < headers.length; j++) {
        record[headers[j]] = values[j] || '';
      }
      
      records.push(record);
      
      // Progress logging for large files
      if (onProgress && lineCount > 10000 && Date.now() - lastProgress > 10000) {
        onProgress(lineCount);
        lastProgress = Date.now();
      }
    });
    
    rl.on('close', () => {
      if (onProgress) {
        onProgress(lineCount); // Final progress
      }
      resolve(records);
    });
    
    rl.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Get file line count without loading into memory
 */
export async function getLineCount(filePath) {
  if (!existsSync(filePath)) {
    return 0;
  }
  
  return new Promise((resolve, reject) => {
    let count = 0;
    
    const fileStream = createReadStream(filePath, {
      encoding: 'utf-8',
      highWaterMark: 512 * 1024
    });
    
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    rl.on('line', () => count++);
    rl.on('close', () => resolve(count));
    rl.on('error', reject);
  });
}

/**
 * Split stop_times.txt into separate files by stop and by route
 * This prevents WASM memory issues by processing smaller datasets
 */
export async function splitStopTimesByStopAndRoute(stopTimesFilePath, tripsFilePath, outputDir, onProgress) {
  // First, load trips to get route_id for each trip_id
  console.log('  📖 Loading trips data...');
  const trips = await streamParseGTFS(tripsFilePath);
  const tripToRoute = new Map();
  for (const trip of trips) {
    tripToRoute.set(trip.trip_id, trip.route_id);
  }
  console.log(`  ✓ Loaded ${trips.length} trips`);
  
  // Create output directories
  const stopTimesDir = join(outputDir, 'stop_times_by_stop');
  const routeTimesDir = join(outputDir, 'stop_times_by_route');
  
  if (!fileExists(stopTimesDir)) {
    mkdirSync(stopTimesDir, { recursive: true });
  }
  if (!fileExists(routeTimesDir)) {
    mkdirSync(routeTimesDir, { recursive: true });
  }
  
  // Track file streams by stop and route
  const stopStreams = new Map();
  const routeStreams = new Map();
  const stopHeaders = new Map();
  const routeHeaders = new Map();
  
  console.log('  🔄 Splitting stop_times.txt by stop and route...');
  
  return new Promise((resolve, reject) => {
    let headers = null;
    let lineCount = 0;
    let processedCount = 0;
    let lastProgress = Date.now();
    
    const fileStream = createReadStream(stopTimesFilePath, {
      encoding: 'utf-8',
      highWaterMark: 512 * 1024
    });
    
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    rl.on('line', (line) => {
      lineCount++;
      
      if (!headers) {
        headers = line.split(',').map(h => h.trim());
        return;
      }
      
      const values = parseCSVLine(line, headers.length);
      const stopIdIndex = headers.indexOf('stop_id');
      const tripIdIndex = headers.indexOf('trip_id');
      
      if (stopIdIndex < 0 || tripIdIndex < 0) {
        return;
      }
      
      const stopId = values[stopIdIndex];
      const tripId = values[tripIdIndex];
      const routeId = tripToRoute.get(tripId) || 'unknown';
      
      if (!stopId) return;
      
      // Write to stop-specific file
      if (!stopStreams.has(stopId)) {
        const stopFilePath = join(stopTimesDir, `${stopId}-stop_times.csv`);
        const stream = createWriteStream(stopFilePath, { flags: 'a' });
        stopStreams.set(stopId, stream);
        // Write header
        stream.write(headers.join(',') + '\n');
      }
      stopStreams.get(stopId).write(line + '\n');
      
      // Write to route-specific file
      if (!routeStreams.has(routeId)) {
        const routeFilePath = join(routeTimesDir, `${routeId}-stop_times.csv`);
        const stream = createWriteStream(routeFilePath, { flags: 'a' });
        routeStreams.set(routeId, stream);
        // Write header
        stream.write(headers.join(',') + '\n');
      }
      routeStreams.get(routeId).write(line + '\n');
      
      processedCount++;
      
      // Progress logging
      if (onProgress && Date.now() - lastProgress > 5000) {
        onProgress(processedCount, lineCount);
        lastProgress = Date.now();
      }
    });
    
    rl.on('close', async () => {
      // Close all streams
      const allStreams = [...stopStreams.values(), ...routeStreams.values()];
      await Promise.all(allStreams.map(stream => new Promise(resolve => {
        stream.end(resolve);
      })));
      
      if (onProgress) {
        onProgress(processedCount, lineCount);
      }
      
      console.log(`  ✓ Split into ${stopStreams.size} stop files and ${routeStreams.size} route files`);
      resolve({ stopCount: stopStreams.size, routeCount: routeStreams.size });
    });
    
    rl.on('error', reject);
  });
}
