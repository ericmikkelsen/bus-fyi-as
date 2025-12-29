// Time formatting utilities

pub fn format_time_12h(time_24h: &str) -> String {
    if time_24h.is_empty() || time_24h.len() < 5 {
        return time_24h.to_string();
    }
    
    let parts: Vec<&str> = time_24h.split(':').collect();
    if parts.is_empty() {
        return time_24h.to_string();
    }
    
    let hour_str = parts[0];
    let Ok(mut hour) = hour_str.parse::<i32>() else {
        return time_24h.to_string();
    };
    
    let minute = if parts.len() > 1 { parts[1] } else { "00" };
    
    // Handle times >= 24:00:00 (next day service)
    if hour >= 24 {
        hour -= 24;
    }
    
    let ampm = if hour >= 12 { "PM" } else { "AM" };
    let hour_12 = if hour == 0 {
        12
    } else if hour > 12 {
        hour - 12
    } else {
        hour
    };
    
    format!("{}:{} {}", hour_12, minute, ampm)
}

pub fn get_hour_from_time(time_str: &str) -> i32 {
    if time_str.is_empty() {
        return 0;
    }
    
    let colon_index = time_str.find(':');
    if colon_index.is_none() {
        return 0;
    }
    
    let hour_str = &time_str[..colon_index.unwrap()];
    let Ok(mut hour) = hour_str.parse::<i32>() else {
        return 0;
    };
    
    // Handle times >= 24:00:00 (next day service)
    if hour >= 24 {
        hour -= 24;
    }
    
    hour
}

pub fn get_service_days(calendar: &super::models::Calendar) -> String {
    let mut days = Vec::new();
    
    if calendar.monday == "1" {
        days.push("Mon");
    }
    if calendar.tuesday == "1" {
        days.push("Tue");
    }
    if calendar.wednesday == "1" {
        days.push("Wed");
    }
    if calendar.thursday == "1" {
        days.push("Thu");
    }
    if calendar.friday == "1" {
        days.push("Fri");
    }
    if calendar.saturday == "1" {
        days.push("Sat");
    }
    if calendar.sunday == "1" {
        days.push("Sun");
    }
    
    days.join(", ")
}
