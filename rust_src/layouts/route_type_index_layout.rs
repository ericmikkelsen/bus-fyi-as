// Route Type Index Layout
use crate::modules::models::StopInfo;

/// Layout for route type index pages
pub fn route_type_index_layout(
    route_type: &str,
    route_type_name: &str,
    stops: Vec<StopInfo>,
) -> String {
    let mut html = String::new();
    
    // HTML header
    html.push_str("<!DOCTYPE html>\n");
    html.push_str("<html lang=\"en\">\n");
    html.push_str("<head>\n");
    html.push_str("  <meta charset=\"UTF-8\">\n");
    html.push_str(&format!("  <title>{} Stops</title>\n", route_type_name));
    html.push_str("  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n");
    html.push_str("</head>\n");
    html.push_str("<body>\n");
    
    // Page header
    html.push_str(&format!("  <h1>{} Stops</h1>\n", route_type_name));
    html.push_str(&format!("  <p>Route Type: {}</p>\n", route_type));
    html.push_str(&format!("  <p>Total Stops: {}</p>\n", stops.len()));
    
    // Stops list
    html.push_str("  <h2>All Stops</h2>\n");
    html.push_str("  <ul>\n");
    
    for stop in stops {
        let location_label = match stop.location_type.as_str() {
            "1" => " (Station)",
            "2" => " (Entrance)",
            "3" => " (Node)",
            "4" => " (Boarding Area)",
            _ => "",
        };
        
        html.push_str(&format!(
            "    <li><a href=\"/stops/{}\">{}{}</a> ({})</li>\n",
            stop.stop_id, stop.stop_name, location_label, stop.stop_id
        ));
    }
    
    html.push_str("  </ul>\n");
    
    // Footer
    html.push_str("</body>\n");
    html.push_str("</html>");
    
    html
}
