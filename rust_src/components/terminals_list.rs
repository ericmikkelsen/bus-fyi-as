// Terminals List Component
use crate::modules::models::ChildStop;

pub fn render(child_stops: &[ChildStop], _agency_id: &str, parent_stop_id: &str) -> String {
    if child_stops.is_empty() {
        return String::new();
    }
    
    let mut html = String::from("  <h2>Terminals</h2>\n  <ul>\n");
    
    for child in child_stops {
        html.push_str(&format!(
            "    <li><a href=\"/stops/{}/{}/\">{}</a></li>\n",
            parent_stop_id, child.id, child.name
        ));
    }
    
    html.push_str("  </ul>\n");
    html
}
