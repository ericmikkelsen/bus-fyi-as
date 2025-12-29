// Stop Page Generator
use crate::components::{stop_header, terminals_list, hour_header};
use crate::layouts::stop_layout;
use crate::modules::{models::*, csv_parser, time_utils};
use std::collections::{HashMap, HashSet};

// Import the thread-local storage from lib.rs
use crate::{ROUTES_DATA, TRIPS_DATA, CALENDAR_DATA};

pub fn generate(
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
    // Parse child stops
    let child_stops: Vec<ChildStop> = serde_json::from_str(child_stops_json).unwrap_or_default();
    
    // Parse CSV data into maps
    let routes_map: HashMap<String, Route> = csv_parser::parse_csv_to_map(routes_csv);
    let trips_map: HashMap<String, Trip> = csv_parser::parse_csv_to_map(trips_csv);
    let calendar_map: HashMap<String, Calendar> = csv_parser::parse_csv_to_map(calendar_csv);
    let stop_times: Vec<StopTime> = csv_parser::parse_csv_to_vec(stop_times_csv);
    
    // Generate header
    let header_html = stop_header::render(stop_name, stop_id, parent_id, parent_name, "cta");
    
    // Generate terminals list
    let terminals_html = terminals_list::render(&child_stops, "cta", stop_id);
    
    // Generate routes section header
    let mut routes_section_header = String::new();
    if !stop_times.is_empty() && !child_stops.is_empty() {
        routes_section_header = format!("\n  <h2>Routes at {}</h2>\n", stop_name);
    }
    
    // Group stop times by hour
    let mut hour_groups: HashMap<i32, Vec<StopTime>> = HashMap::new();
    
    for stop_time in stop_times {
        let hour = time_utils::get_hour_from_time(&stop_time.arrival_time);
        hour_groups.entry(hour).or_insert_with(Vec::new).push(stop_time);
    }
    
    // Sort hours
    let mut hours: Vec<i32> = hour_groups.keys().copied().collect();
    hours.sort();
    
    // Build schedule HTML
    let mut schedule_html = String::new();
    
    for hour in hours {
        let stop_times_for_hour = hour_groups.get(&hour).unwrap();
        
        // Generate hour header
        schedule_html.push_str(&hour_header::render(hour));
        
        // Group by route+headsign+time to collect service days
        let mut entry_map: HashMap<String, (String, String, String, HashSet<String>)> = HashMap::new();
        
        for stop_time in stop_times_for_hour {
            if let Some(trip) = trips_map.get(&stop_time.trip_id) {
                if let Some(route) = routes_map.get(&trip.route_id) {
                    let route_name = if !route.route_short_name.is_empty() {
                        &route.route_short_name
                    } else if !route.route_long_name.is_empty() {
                        &route.route_long_name
                    } else {
                        "Unknown"
                    };
                    
                    let headsign = &trip.trip_headsign;
                    let time = time_utils::format_time_12h(&stop_time.arrival_time);
                    
                    let key = format!("{}|{}|{}", time, route_name, headsign);
                    
                    let entry = entry_map.entry(key).or_insert_with(|| {
                        (time.clone(), route_name.to_string(), headsign.clone(), HashSet::new())
                    });
                    
                    // Add service days
                    if let Some(calendar) = calendar_map.get(&trip.service_id) {
                        let service_days = time_utils::get_service_days(calendar);
                        if !service_days.is_empty() {
                            entry.3.insert(service_days);
                        }
                    }
                }
            }
        }
        
        // Build schedule entries HTML
        schedule_html.push_str("    <ol>\n");
        
        // Sort entries by time
        let mut entries: Vec<_> = entry_map.values().collect();
        entries.sort_by(|a, b| a.0.cmp(&b.0));
        
        for (time, route_name, headsign, service_days_set) in entries {
            let service_days: Vec<String> = service_days_set.iter().cloned().collect();
            let service_days_str = service_days.join(", ");
            
            schedule_html.push_str(&format!("      <li>\n"));
            schedule_html.push_str(&format!(
                "        <time datetime=\"{}\">{}</time> - {}",
                time, time, route_name
            ));
            
            if !headsign.is_empty() {
                schedule_html.push_str(&format!(" to {}", headsign));
            }
            
            if !service_days_str.is_empty() {
                schedule_html.push_str(&format!(" ({})", service_days_str));
            }
            
            schedule_html.push_str("\n      </li>\n");
        }
        
        schedule_html.push_str("    </ol>\n");
    }
    
    // Assemble page content
    let mut content = String::new();
    content.push_str(&header_html);
    content.push('\n');
    content.push_str(&terminals_html);
    content.push('\n');
    content.push_str(&routes_section_header);
    content.push_str(&schedule_html);
    
    // Wrap in layout
    stop_layout::render(stop_name, stop_id, &content)
}

/// OPTIMIZED VERSION: Generate stop page using cached routes, trips, and calendar data
/// This version is 10-100x faster than the original because it doesn't parse large CSVs for each stop
pub fn generate_cached(
    stop_id: &str,
    stop_name: &str,
    parent_id: &str,
    parent_name: &str,
    child_stops_json: &str,
    stop_times_csv: &str,
) -> String {
    // Parse child stops
    let child_stops: Vec<ChildStop> = serde_json::from_str(child_stops_json).unwrap_or_default();
    
    // Parse only the stop times CSV (small, per-stop file)
    let stop_times: Vec<StopTime> = csv_parser::parse_csv_to_vec(stop_times_csv);
    
    // Generate header
    let header_html = stop_header::render(stop_name, stop_id, parent_id, parent_name, "cta");
    
    // Generate terminals list
    let terminals_html = terminals_list::render(&child_stops, "cta", stop_id);
    
    // Generate routes section header
    let mut routes_section_header = String::new();
    if !stop_times.is_empty() && !child_stops.is_empty() {
        routes_section_header = format!("\n  <h2>Routes at {}</h2>\n", stop_name);
    }
    
    // Group stop times by hour
    let mut hour_groups: HashMap<i32, Vec<StopTime>> = HashMap::new();
    
    for stop_time in stop_times {
        let hour = time_utils::get_hour_from_time(&stop_time.arrival_time);
        hour_groups.entry(hour).or_insert_with(Vec::new).push(stop_time);
    }
    
    // Sort hours
    let mut hours: Vec<i32> = hour_groups.keys().copied().collect();
    hours.sort();
    
    // Build schedule HTML using cached data
    let mut schedule_html = String::new();
    
    // Access cached data
    ROUTES_DATA.with(|routes_cell| {
        TRIPS_DATA.with(|trips_cell| {
            CALENDAR_DATA.with(|calendar_cell| {
                if let (Some(routes_map), Some(trips_map), Some(calendar_map)) = (
                    routes_cell.borrow().as_ref(),
                    trips_cell.borrow().as_ref(),
                    calendar_cell.borrow().as_ref()
                ) {
                    for hour in hours {
                        let stop_times_for_hour = hour_groups.get(&hour).unwrap();
                        
                        // Generate hour header
                        schedule_html.push_str(&hour_header::render(hour));
                        
                        // Group by route+headsign+time to collect service days
                        let mut entry_map: HashMap<String, (String, String, String, HashSet<String>)> = HashMap::new();
                        
                        for stop_time in stop_times_for_hour {
                            if let Some(trip) = trips_map.get(&stop_time.trip_id) {
                                if let Some(route) = routes_map.get(&trip.route_id) {
                                    let route_name = if !route.route_short_name.is_empty() {
                                        &route.route_short_name
                                    } else if !route.route_long_name.is_empty() {
                                        &route.route_long_name
                                    } else {
                                        "Unknown"
                                    };
                                    
                                    let headsign = &trip.trip_headsign;
                                    let time = time_utils::format_time_12h(&stop_time.arrival_time);
                                    
                                    let key = format!("{}|{}|{}", time, route_name, headsign);
                                    
                                    let entry = entry_map.entry(key).or_insert_with(|| {
                                        (time.clone(), route_name.to_string(), headsign.clone(), HashSet::new())
                                    });
                                    
                                    // Add service days
                                    if let Some(calendar) = calendar_map.get(&trip.service_id) {
                                        let service_days = time_utils::get_service_days(calendar);
                                        if !service_days.is_empty() {
                                            entry.3.insert(service_days);
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Build schedule entries HTML
                        schedule_html.push_str("    <ol>\n");
                        
                        // Sort entries by time
                        let mut entries: Vec<_> = entry_map.values().collect();
                        entries.sort_by(|a, b| a.0.cmp(&b.0));
                        
                        for (time, route_name, headsign, service_days_set) in entries {
                            let service_days: Vec<String> = service_days_set.iter().cloned().collect();
                            let service_days_str = service_days.join(", ");
                            
                            schedule_html.push_str(&format!("      <li>\n"));
                            schedule_html.push_str(&format!(
                                "        <time datetime=\"{}\">{}</time> - {}",
                                time, time, route_name
                            ));
                            
                            if !headsign.is_empty() {
                                schedule_html.push_str(&format!(" to {}", headsign));
                            }
                            
                            if !service_days_str.is_empty() {
                                schedule_html.push_str(&format!(" ({})", service_days_str));
                            }
                            
                            schedule_html.push_str("\n      </li>\n");
                        }
                        
                        schedule_html.push_str("    </ol>\n");
                    }
                }
            });
        });
    });
    
    // Assemble page content
    let mut content = String::new();
    content.push_str(&header_html);
    content.push('\n');
    content.push_str(&terminals_html);
    content.push('\n');
    content.push_str(&routes_section_header);
    content.push_str(&schedule_html);
    
    // Wrap in layout
    stop_layout::render(stop_name, stop_id, &content)
}
