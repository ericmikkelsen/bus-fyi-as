// BaseLayout
// Basic HTML structure with head and body tags

/**
 * Generates complete HTML page with proper structure
 */
export function BaseLayout(title: string, content: string): string {
  return "<!DOCTYPE html>" +
  "<html lang=\"en\">" +
    "<head>" +
      "<meta charset=\"UTF-8\">" +
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">" +
      "<title>" + title + "</title>" +
    "</head>" +
    "<body>" +
      content + 
    "</body>" +
  "</html>";
}
