use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

// Así se ve una entrada guardada en el vault: un nombre y una contraseña
#[derive(Serialize, Deserialize, Clone, Default)]
struct Entry {
    name: String,
    password: String,
}

// Calcula en qué carpeta del sistema se guarda el archivo del vault
fn vault_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let dir = app_handle
        .path()
        .app_data_dir()
        .expect("no se pudo obtener la carpeta de datos de la app");
    fs::create_dir_all(&dir).ok();
    dir.join("vault.json")
}

// El frontend llama a esto para guardar una nueva entrada
#[tauri::command]
fn save_entry(app_handle: tauri::AppHandle, name: String, password: String) -> Result<(), String> {
    let path = vault_path(&app_handle);

    // Lee lo que ya hubiera guardado (si el archivo existe)
    let mut entries: Vec<Entry> = if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };

    // Añade la nueva entrada y guarda todo de nuevo en el archivo
    entries.push(Entry { name, password });
    let json = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(())
}

// El frontend llama a esto para leer todas las entradas guardadas
#[tauri::command]
fn load_entries(app_handle: tauri::AppHandle) -> Result<Vec<Entry>, String> {
    let path = vault_path(&app_handle);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let entries: Vec<Entry> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(entries)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![save_entry, load_entries])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}