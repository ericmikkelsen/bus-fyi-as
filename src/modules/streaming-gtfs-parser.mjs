// Streaming GTFS parser for handling large files (300MB+)
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { existsSync } from 'fs';

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
