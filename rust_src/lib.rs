// Bus FYI - Rust WASM HTML Generator
// Astro-inspired architecture: pages, layouts, components, modules
mod modules;
mod components;
mod layouts;
mod pages;

use wasm_bindgen::prelude::*;
use std::collections::HashMap;

#[wasm_bindgen]
pub fn generate_stop_page(
    stop_id: &str,
    stop_name: &str,
    parent_id: &str,
    parent_name: &str,
    child_stops_json: &str,
    stop_times_csv: &str,
    routes_csv: &str,
    trips_csv: &str,
    calendar_csv: &str,
) -> String {
    pages::stop_page::generate(
        stop_id,
        stop_name,
        parent_id,
        parent_name,
        child_stops_json,
        stop_times_csv,
        routes_csv,
        trips_csv,
        calendar_csv,
    )
}

#[wasm_bindgen]
pub fn generate_route_type_index_page(
    route_type: &str,
    route_type_name: &str,
    stops_json: &str,
) -> String {
    // Parse stops from JSON
    let stops: Vec<modules::models::StopInfo> = serde_json::from_str(stops_json).unwrap_or_default();
    
    pages::route_type_index_page::generate_route_type_index_page(
        route_type,
        route_type_name,
        stops,
    )
}

/// Extract route types from a stop's CSV data
/// Returns a JSON array of route type strings (e.g., ["1", "3"] for Subway and Bus)
#[wasm_bindgen]
pub fn extract_stop_route_types(
    stop_times_csv: &str,
    routes_csv: &str,
    trips_csv: &str,
) -> String {
    use modules::csv_parser;
    use modules::models::{Route, Trip, StopTime};
    use std::collections::HashSet;
    
    // Parse CSV data
    let routes_map: HashMap<String, Route> = csv_parser::parse_csv_to_map(routes_csv);
    let trips_map: HashMap<String, Trip> = csv_parser::parse_csv_to_map(trips_csv);
    let stop_times: Vec<StopTime> = csv_parser::parse_csv_to_vec(stop_times_csv);
    
    // Collect unique route types
    let mut route_types = HashSet::new();
    
    for stop_time in stop_times {
        if let Some(trip) = trips_map.get(&stop_time.trip_id) {
            if let Some(route) = routes_map.get(&trip.route_id) {
                if !route.route_type.is_empty() {
                    route_types.insert(route.route_type.clone());
                }
            }
        }
    }
    
    // Convert to sorted vector for consistent output
    let mut route_types_vec: Vec<String> = route_types.into_iter().collect();
    route_types_vec.sort();
    
    // Return as JSON array
    serde_json::to_string(&route_types_vec).unwrap_or_else(|_| "[]".to_string())
}
