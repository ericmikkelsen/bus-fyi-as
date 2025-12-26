// CSV Parsing utilities
use std::collections::HashMap;

pub fn parse_csv_to_map<T>(csv_text: &str) -> HashMap<String, T>
where
    T: for<'de> serde::Deserialize<'de>,
{
    let mut map = HashMap::new();
    
    if csv_text.is_empty() {
        return map;
    }
    
    let lines: Vec<&str> = csv_text.lines().collect();
    if lines.len() < 2 {
        return map;
    }
    
    let headers: Vec<&str> = lines[0].split(',').collect();
    
    for line in &lines[1..] {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        
        let values: Vec<&str> = line.split(',').collect();
        if values.len() != headers.len() {
            continue;
        }
        
        // Build JSON object string
        let mut json_obj = String::from("{");
        for (i, header) in headers.iter().enumerate() {
            if i > 0 {
                json_obj.push(',');
            }
            json_obj.push_str(&format!("\"{}\":\"{}\"", header, values[i]));
        }
        json_obj.push('}');
        
        // Parse JSON
        if let Ok(obj) = serde_json::from_str::<T>(&json_obj) {
            // Get first value as key (usually ID field)
            map.insert(values[0].to_string(), obj);
        }
    }
    
    map
}

pub fn parse_csv_to_vec<T>(csv_text: &str) -> Vec<T>
where
    T: for<'de> serde::Deserialize<'de>,
{
    let mut vec = Vec::new();
    
    if csv_text.is_empty() {
        return vec;
    }
    
    let lines: Vec<&str> = csv_text.lines().collect();
    if lines.len() < 2 {
        return vec;
    }
    
    let headers: Vec<&str> = lines[0].split(',').collect();
    
    for line in &lines[1..] {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        
        let values: Vec<&str> = line.split(',').collect();
        if values.len() != headers.len() {
            continue;
        }
        
        // Build JSON object string
        let mut json_obj = String::from("{");
        for (i, header) in headers.iter().enumerate() {
            if i > 0 {
                json_obj.push(',');
            }
            json_obj.push_str(&format!("\"{}\":\"{}\"", header, values[i]));
        }
        json_obj.push('}');
        
        // Parse JSON
        if let Ok(obj) = serde_json::from_str::<T>(&json_obj) {
            vec.push(obj);
        }
    }
    
    vec
}
