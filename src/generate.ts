// Static Site Generator using AssemblyScript modules
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Main static site generator
 */
async function generateSite() {
  console.log('Building AssemblyScript modules...');
  
  // Import the compiled WASM module
  const { generatePage, generateList, generateCard } = await import('../dist/release.js');
  
  // Ensure dist directory exists
  const distDir = join(process.cwd(), 'dist');
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }
  
  console.log('Generating HTML pages...');
  
  // Generate index page
  const homeContent = `
    <section class="hero">
      <h2>Welcome to Bus FYI</h2>
      <p>A static site generator for GTFS transit data built with AssemblyScript</p>
    </section>
    ${generateCard('About', 'This site displays transit schedule information from GTFS data.')}
  `;
  const indexHtml = generatePage('Bus FYI - Home', homeContent);
  writeFileSync(join(distDir, 'index.html'), indexHtml);
  
  // Generate routes page
  const routesList = ['Route 1: Downtown Express', 'Route 2: Crosstown', 'Route 3: Suburban Loop'];
  const routesContent = `
    <h2>Transit Routes</h2>
    ${generateList(routesList)}
  `;
  const routesHtml = generatePage('Bus FYI - Routes', routesContent);
  writeFileSync(join(distDir, 'routes.html'), routesHtml);
  
  // Generate stops page
  const stopsList = ['Main St Station', 'City Center', 'North End Terminal'];
  const stopsContent = `
    <h2>Bus Stops</h2>
    ${generateList(stopsList)}
  `;
  const stopsHtml = generatePage('Bus FYI - Stops', stopsContent);
  writeFileSync(join(distDir, 'stops.html'), stopsHtml);
  
  // Copy CSS to dist
  const cssSource = join(process.cwd(), 'src', 'style.css');
  if (existsSync(cssSource)) {
    const cssContent = readFileSync(cssSource, 'utf-8');
    writeFileSync(join(distDir, 'style.css'), cssContent);
  }
  
  console.log('Static site generated successfully in dist/');
}

// Run the generator if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateSite().catch(console.error);
}

export { generateSite };
