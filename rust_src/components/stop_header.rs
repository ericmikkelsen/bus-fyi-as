// Stop Header Component

pub fn render(
    stop_name: &str,
    stop_id: &str,
    parent_id: &str,
    parent_name: &str,
    _agency_id: &str,
) -> String {
    let mut html = format!("  <h1>{}</h1>\n", stop_name);
    html.push_str(&format!("  <p>Stop ID: {}</p>\n", stop_id));
    
    if !parent_id.is_empty() {
        html.push_str(&format!(
            "  <p><a href=\"/stops/{}/\">← Back to {}</a></p>\n",
            parent_id, parent_name
        ));
    }
    
    html
}
