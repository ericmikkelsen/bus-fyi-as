// Ultra-fast CSV parser in AssemblyScript
// Compiles to WASM for maximum performance

/**
 * Parse a single CSV line into an array of strings
 * Handles quoted values with commas
 */
export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line.charAt(i);
    
    if (char == '"') {
      inQuotes = !inQuotes;
    } else if (char == ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

/**
 * Parse entire CSV content into rows
 * First row is treated as headers
 */
export function parseCSV(content: string): string[][] {
  const lines: string[] = [];
  let start = 0;
  
  // Split lines manually for better performance
  for (let i = 0; i < content.length; i++) {
    if (content.charAt(i) == '\n') {
      const line = content.substring(start, i).trim();
      if (line.length > 0) {
        lines.push(line);
      }
      start = i + 1;
    }
  }
  
  // Add last line if not empty
  const lastLine = content.substring(start).trim();
  if (lastLine.length > 0) {
    lines.push(lastLine);
  }
  
  // Parse each line
  const rows: string[][] = [];
  for (let i = 0; i < lines.length; i++) {
    rows.push(parseCSVLine(lines[i]));
  }
  
  return rows;
}

/**
 * Get column index by header name
 */
export function getColumnIndex(headers: string[], columnName: string): i32 {
  for (let i = 0; i < headers.length; i++) {
    if (headers[i] == columnName) {
      return i;
    }
  }
  return -1;
}

/**
 * Extract column values from CSV data
 */
export function getColumn(rows: string[][], columnIndex: i32): string[] {
  const result: string[] = [];
  for (let i = 1; i < rows.length; i++) { // Skip header row
    if (columnIndex < rows[i].length) {
      result.push(rows[i][columnIndex]);
    }
  }
  return result;
}
