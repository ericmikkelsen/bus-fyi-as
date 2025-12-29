// GTFS data structures and utilities

/**
 * Note: Classes cannot be exported from WASM modules.
 * If you need to work with GTFS data structures in WASM, use plain objects
 * or create factory functions that return objects.
 * 
 * For example:
 * export function createStop(id: string, name: string, lat: f64, lon: f64): void {
 *   // Process stop data...
 * }
 */

/**
 * Calculates distance between two coordinates (Haversine formula)
 */
export function calculateDistance(lat1: f64, lon1: f64, lat2: f64, lon2: f64): f64 {
  const R: f64 = 6371; // Earth's radius in km
  const dLat: f64 = (lat2 - lat1) * Math.PI / 180;
  const dLon: f64 = (lon2 - lon1) * Math.PI / 180;
  
  const a: f64 = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c: f64 = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}
