// StopHeader Component
// Generates the header section for a stop page

/**
 * Generates the header for a stop page
 * Using simple string concatenation to avoid WASM reference counting issues
 */
export function StopHeader(stopName: string, stopId: string, parentStopId: string = '', parentStopName: string = ''): string {
  let html = '  <h1>' + stopName + '</h1>\n';
  
  // If this is a child stop, show link to parent
  if (parentStopId !== '' && parentStopName !== '') {
    html += '  <p><a href="/stops/' + parentStopId + '/index.html">← Back to ' + parentStopName + '</a></p>';
  }
  
  html += '  <p>Stop ID: ' + stopId + '</p>';
  
  return html;
}
