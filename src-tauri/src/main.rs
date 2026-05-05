// Tauri entrypoint for sticky.
//
// Two commands: load_data, save_data.
// All app logic lives in JS (public/storage.js). This file only does
// atomic-rename writes and rotates two backup tiers:
//   1. data.bak.json — a copy of the previous save (every save)
//   2. backups/YYYY-MM-DD.json — first save of each day, kept forever

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const DEFAULT_JSON: &str = r#"{"notes":[],"categories":["work","life","idea"],"listening":[]}"#;

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
fn load_data(app: tauri::AppHandle) -> Result<String, String> {
    let dir = data_dir(&app)?;
    let path = dir.join("data.json");
    if !path.exists() {
        return Ok(DEFAULT_JSON.to_string());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_data(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let dir = data_dir(&app)?;
    let data_path = dir.join("data.json");
    let bak_path = dir.join("data.bak.json");

    if data_path.exists() {
        fs::copy(&data_path, &bak_path).map_err(|e| e.to_string())?;
    }

    let tmp_path = dir.join("data.tmp.json");
    fs::write(&tmp_path, json.as_bytes()).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, &data_path).map_err(|e| e.to_string())?;

    let backups_dir = dir.join("backups");
    fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let snap = backups_dir.join(format!("{}.json", today));
    if !snap.exists() {
        fs::write(&snap, json.as_bytes()).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![load_data, save_data])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
