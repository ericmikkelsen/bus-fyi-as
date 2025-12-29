// Route Type Index Page Generator
use crate::layouts::route_type_index_layout::route_type_index_layout;
use crate::modules::models::StopInfo;

/// Generate a route type index page listing all stops for that type
pub fn generate_route_type_index_page(
    route_type: &str,
    route_type_name: &str,
    stops: Vec<StopInfo>,
) -> String {
    route_type_index_layout(route_type, route_type_name, stops)
}
