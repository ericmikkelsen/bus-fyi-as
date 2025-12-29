// HTML generator utilities for static site generation

/**
 * Generates an HTML page header
 */
export function generateHeader(title: string): string {
  return "<!DOCTYPE html>" + 
"<html lang=\"en\">" +
"<head>" +
"<meta charset=\"UTF-8\">" +
"<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">" +
"<title>" + title + "</title>" +
"<link rel=\"stylesheet\" href=\"/style.css\">" +
"</head>" +
"<body>" +
"<header>" +
"<h1>" + title + "</h1>" +
"<nav>" +
"<a href=\"/\">Home</a>" +
"<a href=\"/routes.html\">Routes</a>" +
"<a href=\"/stops.html\">Stops</a>" +
"</nav>" +
"</header>" +
"<main>";
}

/**
 * Generates an HTML page footer
 */
export function generateFooter(): string {
  return "</main>" +
  "<footer>" +
    "<p>Generated with Bus FYI - AssemblyScript Static Site Generator</p>" +
  "</footer>" +
"</body>" +
"</html>";
}

/**
 * Generates a complete HTML page
 */
export function generatePage(title: string, content: string): string {
  return generateHeader(title) + content + generateFooter();
}

/**
 * Generates HTML for a list of items
 */
export function generateList(items: string[]): string {
  let html = "<ul>";
  for (let i = 0; i < items.length; i++) {
    html += "<li>" + items[i] + "</li>";
  }
  html += '</ul>';
  return html;
}

/**
 * Generates HTML for a card component
 */
export function generateCard(title: string, content: string): string {
  return "<div class=\"card\">" +
  "<h3>" + title + "</h3>" +
  "<div class=\"card-content\">" + content + "</div>" +
"</div>";
}
