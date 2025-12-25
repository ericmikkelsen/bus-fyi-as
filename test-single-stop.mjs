import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname);

console.log('Loading WASM...');
const wasmModule = await import(join(rootDir, 'dist', 'release.js'));

console.log('Reading CSV files...');
const agencyPath = join(rootDir, 'data/cta');
const tripsCSV = readFileSync(join(agencyPath, 'trips.txt'), 'utf-8');
const routesCSV = readFileSync(join(agencyPath, 'routes.txt'), 'utf-8');
const calendarCSV = readFileSync(join(agencyPath, 'calendar.txt'), 'utf-8');

// Read first stop_times file
const stopTimesCSV = readFileSync(join(agencyPath, 'stop_times_by_stop/30-stop_times.csv'), 'utf-8');

console.log('Calling WASM to process stop...');
console.log(`trips CSV: ${tripsCSV.length} bytes`);
console.log(`routes CSV: ${routesCSV.length} bytes`);
console.log(`calendar CSV: ${calendarCSV.length} bytes`);
console.log(`stop_times CSV: ${stopTimesCSV.length} bytes`);

const start = Date.now();
try {
  const html = wasmModule.processStopAndGenerateHTML(
    'Test Stop',
    '30',
    '',
    '',
    'cta',
    [],
    [],
    stopTimesCSV,
    tripsCSV,
    routesCSV,
    calendarCSV
  );
  const elapsed = Date.now() - start;

  console.log(`Generated HTML in ${elapsed}ms`);
  console.log(`HTML length: ${html.length} characters`);
  console.log('\nFirst 500 characters:');
  console.log(html.substring(0, 500));
} catch (error) {
  console.error('Error:', error.message);
  console.error(error.stack);
}
