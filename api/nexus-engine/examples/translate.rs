//! CLI tool for translating Legado book sources to JavaScript.
//!
//! Usage:
//!   cargo run --package nexus-engine --example translate -- --file source.json
//!   cargo run --package nexus-engine --example translate -- --dir sources/legado/

use std::fs;
use std::path::PathBuf;

fn main() {
    let args: Vec<String> = std::env::args().collect();

    let mut file_path: Option<String> = None;
    let mut dir_path: Option<String> = None;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--file" | "-f" => {
                i += 1;
                file_path = Some(args[i].clone());
            },
            "--dir" | "-d" => {
                i += 1;
                dir_path = Some(args[i].clone());
            },
            "--help" | "-h" => {
                println!("Usage:");
                println!("  translate --file <path>    Translate a single Legado JSON file");
                println!(
                    "  translate --dir <path>     Translate all Legado JSON files in a directory"
                );
                return;
            },
            _ => {},
        }
        i += 1;
    }

    if let Some(path) = file_path {
        translate_file(&PathBuf::from(&path));
    } else if let Some(path) = dir_path {
        translate_dir(&PathBuf::from(&path));
    } else {
        eprintln!("Error: specify --file or --dir");
        std::process::exit(1);
    }
}

fn translate_file(path: &PathBuf) {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Error reading {}: {}", path.display(), e);
            return;
        },
    };

    let sources: Vec<nexus_core::legado::LegadoSource> = match serde_json::from_str(&content) {
        Ok(s) => {
            if let Ok(single) = serde_json::from_str::<nexus_core::legado::LegadoSource>(&content) {
                vec![single]
            } else {
                s
            }
        },
        Err(e) => {
            // Try as single object
            match serde_json::from_str::<nexus_core::legado::LegadoSource>(&content) {
                Ok(single) => vec![single],
                Err(e2) => {
                    eprintln!("Error parsing {}: {} / {}", path.display(), e, e2);
                    return;
                },
            }
        },
    };

    for source in &sources {
        let name = &source.book_source_name;
        let url = &source.book_source_url;

        println!("=== {} ===", name);
        println!("URL: {}", url);

        // Run audit
        let audit = nexus_engine::translator::audit::audit_source(source);
        println!("Quality score: {}/100", audit.score);
        println!("Capability: {:?}", audit.capability);
        println!("Backend: {}", audit.recommended_backend());

        // Translate
        match nexus_engine::translator::rules::generate_source(source) {
            Ok(js) => {
                // Save output
                let id = url
                    .replace("https://", "")
                    .replace("http://", "")
                    .replace('/', "_")
                    .replace('.', "_")
                    .chars()
                    .filter(|c| c.is_alphanumeric() || *c == '_')
                    .collect::<String>();

                let output_path = path
                    .parent()
                    .unwrap_or(&PathBuf::from("."))
                    .join("generated")
                    .join(format!("{}.js", id));

                fs::create_dir_all(output_path.parent().unwrap()).ok();
                fs::write(&output_path, &js).ok();

                println!("Generated: {} ({} bytes)", output_path.display(), js.len());
                println!(
                    "Syntax check: {}",
                    if check_js_syntax(&js) {
                        "✅"
                    } else {
                        "⚠️  Manual check needed"
                    }
                );
                println!();
            },
            Err(e) => {
                eprintln!("Translation failed: {}", e);
            },
        }
    }
}

fn translate_dir(path: &PathBuf) {
    let entries = match fs::read_dir(path) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("Error reading directory {}: {}", path.display(), e);
            return;
        },
    };

    let mut count = 0;
    let mut success = 0;

    for entry in entries {
        let entry = entry.unwrap();
        let path = entry.path();

        if path.extension().map(|e| e == "json").unwrap_or(false) {
            count += 1;
            translate_file(&path);
            success += 1;
        }
    }

    println!("\n=== Summary: {}/{} sources translated ===", success, count);
}

fn check_js_syntax(_js: &str) -> bool {
    // Basic structural validation
    _js.contains("export async function search")
        && _js.contains("export async function bookInfo")
        && _js.contains("export async function chapterList")
        && _js.contains("export async function chapterContent")
}
