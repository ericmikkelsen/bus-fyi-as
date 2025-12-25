// StopHeader Component
// Generates the header section for a stop page
// Using as-bind for proper WASM memory management

/**
 * Generates the header for a stop page
 */
export function StopHeader(stopName: string, stopId: string, parentStopId: string, parentStopName: string): string {
  let html = '<h1>' + stopName + '</h1>';
  
  // If this is a child stop, show link to parent
  if (parentStopId !== '' && parentStopName !== '') {
    html += '<p><a href="/stops/' + parentStopId + '/index.html">← Back to ' + parentStopName + '</a></p>';
  }
  
  html += '  <p>Stop ID: ' + stopId + '</p>';
  
  return html;
}
