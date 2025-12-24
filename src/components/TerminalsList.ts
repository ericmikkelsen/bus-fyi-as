// TerminalsList Component
// Returns a template - NO string concatenation with parameters
// JavaScript will handle variable substitution and building the list

/**
 * Returns the terminal list item template
 */
export function TerminalsListItem(): string {
  return '<li><a href="/stops/{{PARENT_ID}}/{{CHILD_ID}}/index.html">{{CHILD_NAME}}</a></li>';
}

/**
 * Returns the terminals section wrapper
 */
export function TerminalsListStart(): string {
  return '<h2>Terminals</h2>  <ul>';
}

export function TerminalsListEnd(): string {
  return '  </ul>';
}
