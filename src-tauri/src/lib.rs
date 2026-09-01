use aes_gcm::{
    aead::{rand_core::RngCore, Aead, KeyInit, OsRng as AeadOsRng},
    Aes256Gcm, Nonce,
};
use argon2::Argon2;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

// Campo libre: para códigos de recuperación, PINs, o lo que el usuario quiera añadir
#[derive(Serialize, Deserialize, Clone, Default)]
struct CustomField {
    label: String,
    value: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct Entry {
    id: String,
    name: String,
    folder: Option<String>,
    username: Option<String>,
    password: Option<String>,
    website: Option<String>,
    notes: Option<String>,
    #[serde(default)]
    custom_fields: Vec<CustomField>,
    #[serde(default)]
    favorite: bool,
    #[serde(default)]
    trashed: bool,
    created_at: u64,
    updated_at: u64,
}

#[derive(Serialize, Deserialize)]
struct VaultFile {
    salt: String,
    nonce: String,
    ciphertext: String,
}

// Estructura para guardar lote de códigos de respaldo
#[derive(Serialize, Deserialize, Clone)]
struct BackupCodeBatch {
    id: String,
    title: String,
    codes: Vec<String>,
    alphabet: String,
    length: u32,
    count: u32,
    has_separator: bool,
    created_at: u64,
}

// La clave derivada de tu contraseña maestra vive aquí, solo en memoria,
// mientras el vault esté desbloqueado. Nunca se guarda en disco.
struct VaultState {
    key: Mutex<Option<[u8; 32]>>,
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

fn vault_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let dir = app_handle
        .path()
        .app_data_dir()
        .expect("no se pudo obtener la carpeta de datos de la app");
    fs::create_dir_all(&dir).ok();
    dir.join("vault.json")
}

// Convierte tu contraseña maestra en una clave de 32 bytes (AES-256),
// combinada con una "sal" aleatoria para que dos vaults nunca den la misma clave
// aunque usen la misma contraseña.
fn derive_key(password: &str, salt_bytes: &[u8]) -> [u8; 32] {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt_bytes, &mut key)
        .expect("fallo al derivar la clave");
    key
}

fn encrypt_entries(key: &[u8; 32], entries: &[Entry]) -> (String, String) {
    let cipher = Aes256Gcm::new_from_slice(key).unwrap();
    let mut nonce_bytes = [0u8; 12];
    AeadOsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let plaintext = serde_json::to_vec(entries).unwrap();
    let ciphertext = cipher.encrypt(nonce, plaintext.as_ref()).unwrap();

    (B64.encode(nonce_bytes), B64.encode(ciphertext))
}

fn decrypt_entries(
    key: &[u8; 32],
    nonce_b64: &str,
    ciphertext_b64: &str,
) -> Result<Vec<Entry>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let nonce_bytes = B64.decode(nonce_b64).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = B64.decode(ciphertext_b64).map_err(|e| e.to_string())?;

    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| "Contraseña maestra incorrecta".to_string())?;

    serde_json::from_slice(&plaintext).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_exists(app_handle: tauri::AppHandle) -> bool {
    vault_path(&app_handle).exists()
}

#[tauri::command]
fn create_vault(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    master_password: String,
) -> Result<(), String> {
    let path = vault_path(&app_handle);
    if path.exists() {
        return Err("Ya existe un vault, no se puede crear otro".into());
    }

    let mut salt_bytes = [0u8; 16];
    AeadOsRng.fill_bytes(&mut salt_bytes);
    let key = derive_key(&master_password, &salt_bytes);

    let (nonce, ciphertext) = encrypt_entries(&key, &Vec::<Entry>::new());

    let file = VaultFile {
        salt: B64.encode(salt_bytes),
        nonce,
        ciphertext,
    };
    let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;

    *state.key.lock().unwrap() = Some(key);
    Ok(())
}

#[tauri::command]
fn unlock_vault(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    master_password: String,
) -> Result<(), String> {
    let path = vault_path(&app_handle);
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: VaultFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let salt_bytes = B64.decode(&file.salt).map_err(|e| e.to_string())?;
    let key = derive_key(&master_password, &salt_bytes);

    // Si la contraseña es incorrecta, esto falla aquí mismo
    decrypt_entries(&key, &file.nonce, &file.ciphertext)?;

    *state.key.lock().unwrap() = Some(key);
    Ok(())
}

#[tauri::command]
fn lock_vault(state: tauri::State<VaultState>) {
    *state.key.lock().unwrap() = None;
}

#[tauri::command]
fn load_entries(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
) -> Result<Vec<Entry>, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let path = vault_path(&app_handle);
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: VaultFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    decrypt_entries(&key, &file.nonce, &file.ciphertext)
}

#[tauri::command]
fn save_entry(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    name: String,
    folder: Option<String>,
    username: Option<String>,
    password: Option<String>,
    website: Option<String>,
    notes: Option<String>,
    custom_fields: Vec<CustomField>,
) -> Result<(), String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let path = vault_path(&app_handle);
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: VaultFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let mut entries = decrypt_entries(&key, &file.nonce, &file.ciphertext)?;

    let now = now_millis();
    entries.push(Entry {
        id: now.to_string(),
        name,
        folder,
        username,
        password,
        website,
        notes,
        custom_fields,
        favorite: false,
        trashed: false,
        created_at: now,
        updated_at: now,
    });

    let (nonce, ciphertext) = encrypt_entries(&key, &entries);
    let new_file = VaultFile {
        salt: file.salt,
        nonce,
        ciphertext,
    };
    let json = serde_json::to_string_pretty(&new_file).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn update_entry(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    id: String,
    name: String,
    folder: Option<String>,
    username: Option<String>,
    password: Option<String>,
    website: Option<String>,
    notes: Option<String>,
    custom_fields: Vec<CustomField>,
) -> Result<(), String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let path = vault_path(&app_handle);
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: VaultFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let mut entries = decrypt_entries(&key, &file.nonce, &file.ciphertext)?;

    let now = now_millis();
    let mut found = false;
    for entry in entries.iter_mut() {
        if entry.id == id {
            entry.name = name.clone();
            entry.folder = folder.clone();
            entry.username = username.clone();
            entry.password = password.clone();
            entry.website = website.clone();
            entry.notes = notes.clone();
            entry.custom_fields = custom_fields.clone();
            entry.updated_at = now;
            found = true;
            break;
        }
    }
    if !found {
        return Err("No se encontró la entrada".into());
    }

    let (nonce, ciphertext) = encrypt_entries(&key, &entries);
    let new_file = VaultFile {
        salt: file.salt,
        nonce,
        ciphertext,
    };
    let json = serde_json::to_string_pretty(&new_file).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn delete_entry(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    id: String,
) -> Result<(), String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let path = vault_path(&app_handle);
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: VaultFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let mut entries = decrypt_entries(&key, &file.nonce, &file.ciphertext)?;

    entries.retain(|e| e.id != id);

    let (nonce, ciphertext) = encrypt_entries(&key, &entries);
    let new_file = VaultFile {
        salt: file.salt,
        nonce,
        ciphertext,
    };
    let json = serde_json::to_string_pretty(&new_file).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn toggle_favorite(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    id: String,
) -> Result<(), String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let path = vault_path(&app_handle);
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: VaultFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let mut entries = decrypt_entries(&key, &file.nonce, &file.ciphertext)?;

    for entry in entries.iter_mut() {
        if entry.id == id {
            entry.favorite = !entry.favorite;
            entry.updated_at = now_millis();
            break;
        }
    }

    let (nonce, ciphertext) = encrypt_entries(&key, &entries);
    let new_file = VaultFile {
        salt: file.salt,
        nonce,
        ciphertext,
    };
    let json = serde_json::to_string_pretty(&new_file).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn trash_entry(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    id: String,
) -> Result<(), String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let path = vault_path(&app_handle);
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: VaultFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let mut entries = decrypt_entries(&key, &file.nonce, &file.ciphertext)?;

    for entry in entries.iter_mut() {
        if entry.id == id {
            entry.trashed = true;
            entry.updated_at = now_millis();
            break;
        }
    }

    let (nonce, ciphertext) = encrypt_entries(&key, &entries);
    let new_file = VaultFile {
        salt: file.salt,
        nonce,
        ciphertext,
    };
    let json = serde_json::to_string_pretty(&new_file).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn restore_entry(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    id: String,
) -> Result<(), String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let path = vault_path(&app_handle);
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: VaultFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let mut entries = decrypt_entries(&key, &file.nonce, &file.ciphertext)?;

    for entry in entries.iter_mut() {
        if entry.id == id {
            entry.trashed = false;
            entry.updated_at = now_millis();
            break;
        }
    }

    let (nonce, ciphertext) = encrypt_entries(&key, &entries);
    let new_file = VaultFile {
        salt: file.salt,
        nonce,
        ciphertext,
    };
    let json = serde_json::to_string_pretty(&new_file).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn save_backup_batch(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    title: String,
    codes: Vec<String>,
    alphabet: String,
    length: u32,
    count: u32,
    has_separator: bool,
) -> Result<(), String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let path = vault_path(&app_handle);
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: VaultFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let mut entries = decrypt_entries(&key, &file.nonce, &file.ciphertext)?;

    let now = now_millis();
    let batch = BackupCodeBatch {
        id: now.to_string(),
        title: title.clone(),
        codes: codes.clone(),
        alphabet: alphabet.clone(),
        length,
        count,
        has_separator,
        created_at: now,
    };

    // Guardar como una entrada con campos personalizados
    entries.push(Entry {
        id: batch.id.clone(),
        name: title,
        folder: Some("Códigos de respaldo".to_string()),
        username: None,
        password: None,
        website: None,
        notes: Some(format!(
            "{} códigos de {} caracteres, alfabeto: {}\nCódigos:\n{}",
            batch.count,
            batch.length,
            batch.alphabet,
            batch.codes.join("\n")
        )),
        custom_fields: vec![
            CustomField {
                label: "Alfabeto".to_string(),
                value: batch.alphabet,
            },
            CustomField {
                label: "Longitud".to_string(),
                value: batch.length.to_string(),
            },
            CustomField {
                label: "Número de códigos".to_string(),
                value: batch.count.to_string(),
            },
            CustomField {
                label: "Códigos".to_string(),
                value: batch.codes.join(", "),
            },
        ],
        favorite: false,
        trashed: false,
        created_at: now,
        updated_at: now,
    });

    let (nonce, ciphertext) = encrypt_entries(&key, &entries);
    let new_file = VaultFile {
        salt: file.salt,
        nonce,
        ciphertext,
    };
    let json = serde_json::to_string_pretty(&new_file).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn verify_master_password(
    app_handle: tauri::AppHandle,
    master_password: String,
) -> Result<bool, String> {
    let path = vault_path(&app_handle);
    if !path.exists() {
        return Err("No existe ningún vault".into());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: VaultFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let salt_bytes = B64.decode(&file.salt).map_err(|e| e.to_string())?;
    let key = derive_key(&master_password, &salt_bytes);
    Ok(decrypt_entries(&key, &file.nonce, &file.ciphertext).is_ok())
}

#[tauri::command]
fn delete_vault(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    master_password: String,
) -> Result<(), String> {
    let path = vault_path(&app_handle);
    if !path.exists() {
        return Err("No existe ningún vault".into());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: VaultFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let salt_bytes = B64.decode(&file.salt).map_err(|e| e.to_string())?;
    let key = derive_key(&master_password, &salt_bytes);

    // Verifica la contraseña otra vez aquí, aunque el frontend ya la comprobó antes —
    // nunca te fíes solo de lo que el frontend dice que verificó.
    decrypt_entries(&key, &file.nonce, &file.ciphertext)?;

    fs::remove_file(&path).map_err(|e| e.to_string())?;

    let activity = activity_path(&app_handle);
    if activity.exists() {
        let _ = fs::remove_file(&activity);
    }

    *state.key.lock().unwrap() = None;
    Ok(())
}

// ---------- Activity Log ----------

#[derive(Serialize, Deserialize, Clone)]
struct ActivityEntry {
    id: String,
    activity_type: String, // login, logout, create, edit, delete, restore, generate
    description: String,
    source: String, // vault, generator, settings, system
    details: Option<String>,
    timestamp: u64,
}

#[tauri::command]
fn save_activity(
    app_handle: tauri::AppHandle,
    activity_type: String,
    description: String,
    source: String,
    details: Option<String>,
) -> Result<(), String> {
    // Cargar actividades existentes
    let path = activity_path(&app_handle);
    let mut activities: Vec<ActivityEntry> = Vec::new();

    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        activities = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    }

    // Crear nueva actividad
    let now = now_millis();
    let entry = ActivityEntry {
        id: now.to_string(),
        activity_type,
        description,
        source,
        details,
        timestamp: now,
    };

    activities.push(entry);

    // Guardar (máximo 1000 entradas para no saturar)
    if activities.len() > 1000 {
        activities = activities.split_off(activities.len() - 1000);
    }

    let json = serde_json::to_string_pretty(&activities).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn load_activities(app_handle: tauri::AppHandle) -> Result<Vec<ActivityEntry>, String> {
    let path = activity_path(&app_handle);
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let activities: Vec<ActivityEntry> =
        serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(activities)
}

#[tauri::command]
fn clear_activities(app_handle: tauri::AppHandle) -> Result<(), String> {
    let path = activity_path(&app_handle);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn activity_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let dir = app_handle
        .path()
        .app_data_dir()
        .expect("no se pudo obtener la carpeta de datos de la app");
    fs::create_dir_all(&dir).ok();
    dir.join("activity.json")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(VaultState {
            key: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            vault_exists,
            create_vault,
            unlock_vault,
            lock_vault,
            load_entries,
            save_entry,
            update_entry,
            delete_entry,
            toggle_favorite,
            trash_entry,
            restore_entry,
            save_backup_batch,
            verify_master_password,
            delete_vault,
            save_activity,
            load_activities,
            clear_activities
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
