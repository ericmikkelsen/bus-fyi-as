// Static Site Generator using AssemblyScript modules
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

/**
 * Main static site generator
 */
async function generateSite() {
  console.log('Building AssemblyScript modules...');
  
  // Import the compiled WASM module
  const wasmModule = await import(join(rootDir, 'dist', 'release.js'));
  const { generatePage, generateList, generateCard } = wasmModule;
  
  // Ensure dist directory exists
  const distDir = join(rootDir, 'dist');
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }
  
  console.log('Generating HTML pages...');
  
  // Check if data directory has any agencies
  const dataDir = join(rootDir, 'data');
  let agencyCount = 0;
  let agencies = [];
  
  if (existsSync(dataDir)) {
    const entries = readdirSync(dataDir, { withFileTypes: true });
    agencies = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
    agencyCount = agencies.length;
  }
  
  // Generate index page
  const dataInfo = agencyCount > 0 
    ? `Found ${agencyCount} transit ${agencyCount === 1 ? 'agency' : 'agencies'}: ${agencies.join(', ')}`
    : 'No GTFS data found. Add transit agency data to the data/ directory to get started.';
  
  const homeContent = `
    <section class="hero">
      <h2>Welcome to Bus FYI</h2>
      <p>A static site generator for GTFS transit data built with AssemblyScript</p>
    </section>
    ${generateCard('About', 'This site displays transit schedule information from GTFS data.')}
    ${generateCard('Data Status', dataInfo)}
  `;
  const indexHtml = generatePage('Bus FYI - Home', homeContent);
  writeFileSync(join(distDir, 'index.html'), indexHtml);
  
  // Generate routes page
  const routesList = ['Route 1: Downtown Express', 'Route 2: Crosstown', 'Route 3: Suburban Loop'];
  const routesContent = `
    <h2>Transit Routes</h2>
    <p>Example routes (connect GTFS data to populate real routes)</p>
    ${generateList(routesList)}
  `;
  const routesHtml = generatePage('Bus FYI - Routes', routesContent);
  writeFileSync(join(distDir, 'routes.html'), routesHtml);
  
  // Generate stops page
  const stopsList = ['Main St Station', 'City Center', 'North End Terminal'];
  const stopsContent = `
    <h2>Bus Stops</h2>
    <p>Example stops (connect GTFS data to populate real stops)</p>
    ${generateList(stopsList)}
  `;
  const stopsHtml = generatePage('Bus FYI - Stops', stopsContent);
  writeFileSync(join(distDir, 'stops.html'), stopsHtml);
  
  // Copy CSS to dist
  const cssSource = join(rootDir, 'src', 'style.css');
  if (existsSync(cssSource)) {
    const cssContent = readFileSync(cssSource, 'utf-8');
    writeFileSync(join(distDir, 'style.css'), cssContent);
  }
  
  console.log('✓ Static site generated successfully in dist/');
  console.log(`✓ Generated ${3} HTML pages`);
  console.log(`✓ Copied CSS styles`);
}

// Run the generator
generateSite().catch(console.error);
