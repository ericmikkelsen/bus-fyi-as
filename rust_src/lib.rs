// Bus FYI - Rust WASM HTML Generator
// Astro-inspired architecture: pages, layouts, components, modules
mod modules;
mod components;
mod layouts;
mod pages;

use wasm_bindgen::prelude::*;

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
