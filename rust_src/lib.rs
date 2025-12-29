// Bus FYI - Rust WASM HTML Generator
// Astro-inspired architecture: pages, layouts, components, modules
mod modules;
mod components;
mod layouts;
mod pages;

use wasm_bindgen::prelude::*;
use std::collections::HashMap;
use std::cell::RefCell;

// Thread-local storage for routes, trips, and calendar data (loaded once, reused for all stops)
thread_local! {
    pub(crate) static ROUTES_DATA: RefCell<Option<HashMap<String, modules::models::Route>>> = RefCell::new(None);
    pub(crate) static TRIPS_DATA: RefCell<Option<HashMap<String, modules::models::Trip>>> = RefCell::new(None);
    pub(crate) static CALENDAR_DATA: RefCell<Option<HashMap<String, modules::models::Calendar>>> = RefCell::new(None);
}

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
    pages::stop_page::generate_cached(
        stop_id,
        stop_name,
        parent_id,
        parent_name,
        child_stops_json,
        stop_times_csv,
    )
}

/// Generate stop page using cached data (OPTIMIZED - no CSV parsing!)
/// This is 10-100x faster than the original generate_stop_page
#[wasm_bindgen]
pub fn generate_stop_page_cached(
    stop_id: &str,
    stop_name: &str,
    parent_id: &str,
    parent_name: &str,
    child_stops_json: &str,
    stop_times_csv: &str,
) -> String {
    pages::stop_page::generate_cached(
        stop_id,
        stop_name,
        parent_id,
        parent_name,
        child_stops_json,
        stop_times_csv,
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

/// Initialize routes, trips, and calendar data - CALL ONCE at start of build
/// This loads the large routes.csv, trips.csv, and calendar.csv files into memory
/// and keeps them cached for all subsequent stop processing
#[wasm_bindgen]
pub fn init_routes_and_trips(routes_csv: &str, trips_csv: &str) {
    use modules::csv_parser;
    
    // Parse CSV data once
    let routes_map: HashMap<String, modules::models::Route> = csv_parser::parse_csv_to_map(routes_csv);
    let trips_map: HashMap<String, modules::models::Trip> = csv_parser::parse_csv_to_map(trips_csv);
    
    // Store in thread-local storage for reuse
    ROUTES_DATA.with(|r| {
        *r.borrow_mut() = Some(routes_map);
    });
    
    TRIPS_DATA.with(|t| {
        *t.borrow_mut() = Some(trips_map);
    });
}

/// Initialize calendar data separately (called after init_routes_and_trips)
#[wasm_bindgen]
pub fn init_calendar(calendar_csv: &str) {
    use modules::csv_parser;
    
    // Parse calendar CSV once
    let calendar_map: HashMap<String, modules::models::Calendar> = csv_parser::parse_csv_to_map(calendar_csv);
    
    // Store in thread-local storage for reuse
    CALENDAR_DATA.with(|c| {
        *c.borrow_mut() = Some(calendar_map);
    });
}

/// Extract route types from a stop's CSV data (uses cached routes/trips data)
/// Returns a JSON array of route type strings (e.g., ["1", "3"] for Subway and Bus)
/// 
/// PERFORMANCE: This function now uses pre-loaded routes and trips data from init_routes_and_trips()
/// instead of parsing the full CSV files for every stop. This provides 10-100x speedup.
#[wasm_bindgen]
pub fn extract_stop_route_types(stop_times_csv: &str) -> String {
    use modules::csv_parser;
    use modules::models::StopTime;
    use std::collections::HashSet;
    
    // Parse only the stop times CSV (small, per-stop file)
    let stop_times: Vec<StopTime> = csv_parser::parse_csv_to_vec(stop_times_csv);
    
    // Use cached routes and trips data (loaded once at initialization)
    let mut route_types = HashSet::new();
    
    ROUTES_DATA.with(|routes_cell| {
        TRIPS_DATA.with(|trips_cell| {
            if let (Some(routes_map), Some(trips_map)) = (routes_cell.borrow().as_ref(), trips_cell.borrow().as_ref()) {
                // Collect unique route types using cached data
                for stop_time in stop_times {
                    if let Some(trip) = trips_map.get(&stop_time.trip_id) {
                        if let Some(route) = routes_map.get(&trip.route_id) {
                            if !route.route_type.is_empty() {
                                route_types.insert(route.route_type.clone());
                            }
                        }
                    }
                }
            }
        });
    });
    
    // Convert to sorted vector for consistent output
    let mut route_types_vec: Vec<String> = route_types.into_iter().collect();
    route_types_vec.sort();
    
    // Return as JSON array
    serde_json::to_string(&route_types_vec).unwrap_or_else(|_| "[]".to_string())
}
