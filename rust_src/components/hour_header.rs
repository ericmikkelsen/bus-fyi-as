// Hour Header Component

pub fn render(hour: i32) -> String {
    let ampm = if hour >= 12 { "PM" } else { "AM" };
    let hour_12 = if hour == 0 {
        12
    } else if hour > 12 {
        hour - 12
    } else {
        hour
    };
    
    format!("    <h3>{}:00 {}</h3>\n", hour_12, ampm)
}
