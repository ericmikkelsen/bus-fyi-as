// Stop Page Layout

pub fn render(stop_name: &str, stop_id: &str, content: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{} - Stop {}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
{}
</body>
</html>
"#,
        stop_name, stop_id, content
    )
}
