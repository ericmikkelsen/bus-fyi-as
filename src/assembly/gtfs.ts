// GTFS data structures and utilities

/**
 * Represents a GTFS stop
 */
export class Stop {
  stop_id: string;
  stop_name: string;
  stop_lat: f64;
  stop_lon: f64;

  constructor(id: string, name: string, lat: f64, lon: f64) {
    this.stop_id = id;
    this.stop_name = name;
    this.stop_lat = lat;
    this.stop_lon = lon;
  }
}

/**
 * Represents a GTFS route
 */
export class Route {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: i32;

  constructor(id: string, shortName: string, longName: string, type: i32) {
    this.route_id = id;
    this.route_short_name = shortName;
    this.route_long_name = longName;
    this.route_type = type;
  }
}

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
