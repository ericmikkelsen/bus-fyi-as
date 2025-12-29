// Shared utility to split stop_times.txt by stop_id
// This creates individual CSV files for each stop to avoid parsing massive files during generation

import { createWriteStream, existsSync, mkdirSync, createReadStream } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

/**
 * Split stop_times.txt by stop_id into individual CSV files
 * 
 * @param {string} dataDir - Directory containing GTFS files (e.g., data/cta/)
 * @returns {Promise<string>} - Path to the stop_times_by_stop directory
 */
export async function splitStopTimes(dataDir) {
  console.log('Splitting stop_times.txt by stop...');
  
  const stopTimesPath = join(dataDir, 'stop_times.txt');
  const outputDir = join(dataDir, 'stop_times_by_stop');
  
  if (existsSync(outputDir)) {
    console.log('✅ stop_times_by_stop directory already exists, skipping split\n');
    return outputDir;
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
  
  let stopIdIndex = -1;
  
  for await (const line of rl) {
    if (isFirstLine) {
      header = line + '\n';
      isFirstLine = false;
      
      // Find stop_id column index from header
      const headerParts = line.split(',');
      stopIdIndex = headerParts.findIndex(h => h.trim().toLowerCase() === 'stop_id');
      
      if (stopIdIndex === -1) {
        console.error('❌ Error: stop_id column not found in stop_times.txt header');
        console.error('   Header columns:', headerParts.join(', '));
        throw new Error('stop_id column not found in header');
      }
      
      console.log(`✅ Found stop_id at column index ${stopIdIndex}`);
      continue;
    }
    
    lineCount++;
    
    // Extract stop_id from the correct column
    const parts = line.split(',');
    const stopId = parts[stopIdIndex]?.trim().replace(/^"|"$/g, ''); // Remove quotes if present
    
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
  
  return outputDir;
}
