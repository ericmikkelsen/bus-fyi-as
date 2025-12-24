// TerminalsList Component
// Generates a list of child terminals for a parent stop

/**
 * Generates a list of terminals
 * Parent stop ID is needed to construct nested paths for child stops
 */
export function TerminalsList(parentStopId: string, childStopIds: string[], childStopNames: string[]): string {
  if (childStopIds.length === 0) {
    return '';
  }
  
  let html = `\n  <h2>Terminals</h2>\n`;
  html += `  <ul>\n`;
  
  for (let i = 0; i < childStopIds.length; i++) {
    html += `    <li><a href="/stops/${parentStopId}/${childStopIds[i]}/index.html">${childStopNames[i]}</a></li>\n`;
  }
  
  html += `  </ul>\n`;
  
  return html;
}
