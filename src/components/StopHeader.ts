// StopHeader Component
// Returns static HTML templates - NO string concatenation with parameters
// JavaScript will handle variable substitution

/**
 * Returns the template for stop header with parent link
 */
export function StopHeaderWithParent(): string {
  return '  <h1>{{STOP_NAME}}</h1>\n  <p><a href="/stops/{{PARENT_ID}}/index.html">← Back to {{PARENT_NAME}}</a></p>\n  <p>Stop ID: {{STOP_ID}}</p>';
}

/**
 * Returns the template for stop header without parent link
 */
export function StopHeaderNoParent(): string {
  return '  <h1>{{STOP_NAME}}</h1>\n  <p>Stop ID: {{STOP_ID}}</p>';
}
