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
use tauri_plugin_autostart::MacosLauncher;

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
    totp_secret: Option<String>,
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
    totp_secret: Option<String>,
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
        totp_secret,
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
    totp_secret: Option<String>,
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
            entry.totp_secret = totp_secret.clone();
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
        totp_secret: None,
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

#[tauri::command]
fn export_vault(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    export_password: String,
) -> Result<String, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let local_key = key_opt.ok_or("El vault está bloqueado")?;

    let local_path = vault_path(&app_handle);
    let local_content = fs::read_to_string(&local_path).map_err(|e| e.to_string())?;
    let local_file: VaultFile = serde_json::from_str(&local_content).map_err(|e| e.to_string())?;
    let entries = decrypt_entries(&local_key, &local_file.nonce, &local_file.ciphertext)?;

    // Se cifra con una contraseña NUEVA, propia del archivo — nunca con la contraseña maestra real
    let mut salt_bytes = [0u8; 16];
    AeadOsRng.fill_bytes(&mut salt_bytes);
    let export_key = derive_key(&export_password, &salt_bytes);

    let (nonce, ciphertext) = encrypt_entries(&export_key, &entries);
    let export_file = VaultFile {
        salt: B64.encode(salt_bytes),
        nonce,
        ciphertext,
    };
    serde_json::to_string_pretty(&export_file).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_vault(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    file_content: String,
    export_password: String,
    mode: String, // "add_duplicates" | "skip_duplicates" | "replace_all"
) -> Result<usize, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let local_key = key_opt.ok_or("El vault está bloqueado")?;

    let imported_file: VaultFile = serde_json::from_str(&file_content)
        .map_err(|_| "El archivo no tiene un formato válido de Sailock".to_string())?;
    let imported_salt = B64.decode(&imported_file.salt).map_err(|e| e.to_string())?;
    let imported_key = derive_key(&export_password, &imported_salt);
    let imported_entries = decrypt_entries(
        &imported_key,
        &imported_file.nonce,
        &imported_file.ciphertext,
    )
    .map_err(|_| "Contraseña incorrecta para este archivo".to_string())?;

    let local_path = vault_path(&app_handle);
    let local_content = fs::read_to_string(&local_path).map_err(|e| e.to_string())?;
    let local_file: VaultFile = serde_json::from_str(&local_content).map_err(|e| e.to_string())?;
    let mut local_entries = decrypt_entries(&local_key, &local_file.nonce, &local_file.ciphertext)?;

    let final_imported: Vec<Entry> = match mode.as_str() {
        "replace_all" => imported_entries,
        "skip_duplicates" => {
            let existing_names: std::collections::HashSet<String> = local_entries
                .iter()
                .map(|e| e.name.to_lowercase())
                .collect();
            imported_entries
                .into_iter()
                .filter(|e| !existing_names.contains(&e.name.to_lowercase()))
                .collect()
        }
        _ => imported_entries, // "add_duplicates"
    };

    let imported_count = final_imported.len();

    if mode == "replace_all" {
        local_entries = Vec::new();
    }

    let base_time = now_millis();
    for (i, mut entry) in final_imported.into_iter().enumerate() {
        entry.id = format!("{}-{}", base_time, i);
        local_entries.push(entry);
    }

    let (nonce, ciphertext) = encrypt_entries(&local_key, &local_entries);
    let new_file = VaultFile {
        salt: local_file.salt,
        nonce,
        ciphertext,
    };
    let json = serde_json::to_string_pretty(&new_file).map_err(|e| e.to_string())?;
    fs::write(&local_path, json).map_err(|e| e.to_string())?;

    Ok(imported_count)
}
const MAX_GENERATOR_HISTORY_PER_TYPE: usize = 5;

#[derive(Serialize, Deserialize, Clone)]
struct GeneratorHistoryEntry {
    id: String,
    generator_type: String,
    value: String,
    created_at: u64,
}

#[derive(Serialize, Deserialize)]
struct GeneratorHistoryFile {
    nonce: String,
    ciphertext: String,
}

fn generator_history_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let dir = app_handle
        .path()
        .app_data_dir()
        .expect("no se pudo obtener la carpeta de datos de la app");
    fs::create_dir_all(&dir).ok();
    dir.join("generator_history.json")
}

fn read_generator_history(
    app_handle: &tauri::AppHandle,
    key: &[u8; 32],
) -> Vec<GeneratorHistoryEntry> {
    let path = generator_history_path(app_handle);
    if !path.exists() {
        return Vec::new();
    }
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    let file: GeneratorHistoryFile = match serde_json::from_str(&content) {
        Ok(f) => f,
        Err(_) => return Vec::new(),
    };
    let cipher = match Aes256Gcm::new_from_slice(key) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    let nonce_bytes = match B64.decode(&file.nonce) {
        Ok(n) => n,
        Err(_) => return Vec::new(),
    };
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = match B64.decode(&file.ciphertext) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    match cipher.decrypt(nonce, ciphertext.as_ref()) {
        Ok(plaintext) => serde_json::from_slice(&plaintext).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

fn write_generator_history(
    app_handle: &tauri::AppHandle,
    key: &[u8; 32],
    entries: &[GeneratorHistoryEntry],
) {
    let cipher = match Aes256Gcm::new_from_slice(key) {
        Ok(c) => c,
        Err(_) => return,
    };
    let mut nonce_bytes = [0u8; 12];
    AeadOsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = match serde_json::to_vec(entries) {
        Ok(p) => p,
        Err(_) => return,
    };
    let ciphertext = match cipher.encrypt(nonce, plaintext.as_ref()) {
        Ok(c) => c,
        Err(_) => return,
    };
    let file = GeneratorHistoryFile {
        nonce: B64.encode(nonce_bytes),
        ciphertext: B64.encode(ciphertext),
    };
    if let Ok(json) = serde_json::to_string_pretty(&file) {
        let path = generator_history_path(app_handle);
        let _ = fs::write(&path, json);
    }
}

#[tauri::command]
fn add_generator_history_entry(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    generator_type: String,
    value: String,
) -> Result<(), String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let now = now_millis();
    let mut entries = read_generator_history(&app_handle, &key);
    entries.push(GeneratorHistoryEntry {
        id: now.to_string(),
        generator_type: generator_type.clone(),
        value,
        created_at: now,
    });

    let (mut same_type, other_types): (Vec<GeneratorHistoryEntry>, Vec<GeneratorHistoryEntry>) =
        entries
            .into_iter()
            .partition(|e| e.generator_type == generator_type);
    same_type.sort_by_key(|e| e.created_at);
    if same_type.len() > MAX_GENERATOR_HISTORY_PER_TYPE {
        same_type = same_type.split_off(same_type.len() - MAX_GENERATOR_HISTORY_PER_TYPE);
    }
    let mut final_entries = other_types;
    final_entries.extend(same_type);
    final_entries.sort_by_key(|e| e.created_at);

    write_generator_history(&app_handle, &key, &final_entries);
    Ok(())
}

#[tauri::command]
fn get_generator_history(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
) -> Result<Vec<GeneratorHistoryEntry>, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;
    Ok(read_generator_history(&app_handle, &key))
}

#[tauri::command]
fn clear_generator_history(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
) -> Result<(), String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;
    write_generator_history(&app_handle, &key, &[]);
    Ok(())
}

// ---------- TOTP (verificación en dos pasos) ----------

use totp_rs::{Algorithm, Secret, TOTP};

// Reconstruye el mismo objeto TOTP cada vez a partir del secreto guardado —
// nunca guardamos el código en sí, solo el secreto, y lo recalculamos al vuelo.
fn build_totp(secret_base32: &str, account_name: &str) -> Result<TOTP, String> {
    let secret = Secret::Encoded(secret_base32.to_string());
    TOTP::new(
        Algorithm::SHA1,
        6,
        1,
        30,
        secret.to_bytes().map_err(|e| e.to_string())?,
        Some("Sailock".to_string()),
        account_name.to_string(),
    )
    .map_err(|e| e.to_string())
}

// Crea un secreto nuevo, aleatorio, de 160 bits — se usa una sola vez al configurar el 2FA
#[tauri::command]
fn generate_totp_secret() -> String {
    Secret::generate_secret().to_encoded().to_string()
}

// Código QR (en base64) para escanear con Google Authenticator, Authy, etc.
#[tauri::command]
fn get_totp_qr(secret_base32: String, account_name: String) -> Result<String, String> {
    let totp = build_totp(&secret_base32, &account_name)?;
    totp.get_qr_base64()
}

// El código de 6 dígitos actual + segundos que quedan hasta que cambie
#[tauri::command]
fn get_totp_code(secret_base32: String, account_name: String) -> Result<(String, u64), String> {
    let totp = build_totp(&secret_base32, &account_name)?;
    let code = totp.generate_current().map_err(|e| e.to_string())?;
    let ttl = totp.ttl().map_err(|e| e.to_string())?;
    Ok((code, ttl))
}

// Comprueba que el código que escribió el usuario es correcto (con un pequeño margen
// de tolerancia por si el reloj del móvil y el del PC no están exactamente sincronizados)
#[tauri::command]
fn verify_totp_code(
    secret_base32: String,
    account_name: String,
    code: String,
) -> Result<bool, String> {
    let totp = build_totp(&secret_base32, &account_name)?;
    totp.check_current(&code).map_err(|e| e.to_string())
}

// ---------- TOTP para el propio desbloqueo de Sailock (2FA) ----------

const TOTP_ACCOUNT_NAME: &str = "Sailock";

#[derive(Serialize, Deserialize, Default)]
struct TotpSettings {
    enabled: bool,
    secret: Option<String>,
    #[serde(default)]
    backup_code_hashes: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct TotpFile {
    nonce: String,
    ciphertext: String,
}

fn totp_settings_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let dir = app_handle
        .path()
        .app_data_dir()
        .expect("no se pudo obtener la carpeta de datos de la app");
    fs::create_dir_all(&dir).ok();
    dir.join("totp_settings.json")
}

fn read_totp_settings(app_handle: &tauri::AppHandle, key: &[u8; 32]) -> TotpSettings {
    let path = totp_settings_path(app_handle);
    if !path.exists() {
        return TotpSettings::default();
    }
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return TotpSettings::default(),
    };
    let file: TotpFile = match serde_json::from_str(&content) {
        Ok(f) => f,
        Err(_) => return TotpSettings::default(),
    };
    let cipher = match Aes256Gcm::new_from_slice(key) {
        Ok(c) => c,
        Err(_) => return TotpSettings::default(),
    };
    let nonce_bytes = match B64.decode(&file.nonce) {
        Ok(n) => n,
        Err(_) => return TotpSettings::default(),
    };
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = match B64.decode(&file.ciphertext) {
        Ok(c) => c,
        Err(_) => return TotpSettings::default(),
    };
    match cipher.decrypt(nonce, ciphertext.as_ref()) {
        Ok(plaintext) => serde_json::from_slice(&plaintext).unwrap_or_default(),
        Err(_) => TotpSettings::default(),
    }
}

fn write_totp_settings(app_handle: &tauri::AppHandle, key: &[u8; 32], settings: &TotpSettings) {
    let cipher = match Aes256Gcm::new_from_slice(key) {
        Ok(c) => c,
        Err(_) => return,
    };
    let mut nonce_bytes = [0u8; 12];
    AeadOsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = match serde_json::to_vec(settings) {
        Ok(p) => p,
        Err(_) => return,
    };
    let ciphertext = match cipher.encrypt(nonce, plaintext.as_ref()) {
        Ok(c) => c,
        Err(_) => return,
    };
    let file = TotpFile {
        nonce: B64.encode(nonce_bytes),
        ciphertext: B64.encode(ciphertext),
    };
    if let Ok(json) = serde_json::to_string_pretty(&file) {
        let path = totp_settings_path(app_handle);
        let _ = fs::write(&path, json);
    }
}

fn build_app_totp(secret_base32: &str) -> Result<TOTP, String> {
    build_totp(secret_base32, TOTP_ACCOUNT_NAME)
}

#[tauri::command]
fn totp_status(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
) -> Result<bool, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;
    Ok(read_totp_settings(&app_handle, &key).enabled)
}

#[tauri::command]
fn totp_begin_setup(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
) -> Result<String, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let secret_base32 = Secret::generate_secret().to_encoded().to_string();
    let settings = TotpSettings {
        enabled: false,
        secret: Some(secret_base32.clone()),
        backup_code_hashes: Vec::new(),
    };
    write_totp_settings(&app_handle, &key, &settings);

    let totp = build_app_totp(&secret_base32)?;
    totp.get_qr_base64()
}

#[tauri::command]
fn totp_confirm_setup(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    code: String,
) -> Result<bool, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let mut settings = read_totp_settings(&app_handle, &key);
    let secret = settings
        .secret
        .clone()
        .ok_or("No hay ninguna configuración de 2FA pendiente")?;
    let totp = build_app_totp(&secret)?;
    let ok = totp.check_current(&code).map_err(|e| e.to_string())?;
    if ok {
        settings.enabled = true;
        write_totp_settings(&app_handle, &key, &settings);
    }
    Ok(ok)
}

#[tauri::command]
fn totp_verify_unlock(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    code: String,
) -> Result<bool, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let settings = read_totp_settings(&app_handle, &key);
    let secret = settings.secret.ok_or("El 2FA no está configurado")?;
    let totp = build_app_totp(&secret)?;
    totp.check_current(&code).map_err(|e| e.to_string())
}

#[tauri::command]
fn totp_disable(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
) -> Result<(), String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;
    write_totp_settings(&app_handle, &key, &TotpSettings::default());
    Ok(())
}

// ---------- Códigos de recuperación del 2FA (por si pierdes el dispositivo) ----------

use sha2::{Digest, Sha256};

// Sin 0/O/1/I/2/S/5/Z, para que no se confundan al escribirlos a mano
const BACKUP_CODE_ALPHABET: &[u8] = b"346789ABCDEFGHJKLMNPQRTUVWXY";
const BACKUP_CODE_COUNT: usize = 10;
const BACKUP_CODE_LENGTH: usize = 10; // se muestra como dos grupos de 5, ej: K7WXN-QRT9M

fn random_alphabet_char() -> u8 {
    let alphabet_len = BACKUP_CODE_ALPHABET.len() as u32;
    let max_valid = (u32::MAX / alphabet_len) * alphabet_len;
    loop {
        let mut buf = [0u8; 4];
        AeadOsRng.fill_bytes(&mut buf);
        let value = u32::from_le_bytes(buf);
        if value < max_valid {
            return BACKUP_CODE_ALPHABET[(value % alphabet_len) as usize];
        }
    }
}

fn generate_backup_code() -> String {
    let raw: String = (0..BACKUP_CODE_LENGTH)
        .map(|_| random_alphabet_char() as char)
        .collect();
    format!("{}-{}", &raw[0..5], &raw[5..10])
}

fn hash_backup_code(code: &str) -> String {
    let normalized = code.trim().to_uppercase();
    let mut hasher = Sha256::new();
    hasher.update(normalized.as_bytes());
    B64.encode(hasher.finalize())
}

#[tauri::command]
fn totp_backup_codes_remaining(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
) -> Result<usize, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;
    Ok(read_totp_settings(&app_handle, &key)
        .backup_code_hashes
        .len())
}

#[tauri::command]
fn totp_generate_backup_codes(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
) -> Result<Vec<String>, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let mut settings = read_totp_settings(&app_handle, &key);
    if !settings.enabled {
        return Err("Activa primero la verificación en dos pasos".into());
    }

    let codes: Vec<String> = (0..BACKUP_CODE_COUNT)
        .map(|_| generate_backup_code())
        .collect();
    settings.backup_code_hashes = codes.iter().map(|c| hash_backup_code(c)).collect();
    write_totp_settings(&app_handle, &key, &settings);

    Ok(codes)
}

#[tauri::command]
fn totp_verify_backup_code(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    code: String,
) -> Result<bool, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let mut settings = read_totp_settings(&app_handle, &key);
    let incoming_hash = hash_backup_code(&code);

    if let Some(pos) = settings
        .backup_code_hashes
        .iter()
        .position(|h| h == &incoming_hash)
    {
        settings.backup_code_hashes.remove(pos);
        write_totp_settings(&app_handle, &key, &settings);
        Ok(true)
    } else {
        Ok(false)
    }
}

// ---------- Activity Log ----------
#[derive(Serialize, Deserialize, Clone)]
struct ActivityEntry {
    id: String,
    activity_type: String,
    #[serde(default)]
    description: Option<String>, // solo entradas antiguas, ya escritas en un idioma fijo
    #[serde(default)]
    event_key: Option<String>, // entradas nuevas: clave de evento a traducir en el momento de mostrarla
    #[serde(default)]
    params: Option<std::collections::HashMap<String, String>>, // datos variables (nombre, cantidad...)
    source: String,
    #[serde(default)]
    details: Option<String>, // solo entradas antiguas
    timestamp: u64,
}

#[tauri::command]
fn save_activity(
    app_handle: tauri::AppHandle,
    activity_type: String,
    event_key: String,
    source: String,
    params: Option<std::collections::HashMap<String, String>>,
) -> Result<(), String> {
    let path = activity_path(&app_handle);
    let mut activities: Vec<ActivityEntry> = Vec::new();

    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        activities = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    }

    let now = now_millis();
    let entry = ActivityEntry {
        id: now.to_string(),
        activity_type,
        description: None,
        event_key: Some(event_key),
        params,
        source,
        details: None,
        timestamp: now,
    };

    activities.push(entry);

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
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
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
            clear_activities,
            generate_totp_secret,
            get_totp_qr,
            get_totp_code,
            verify_totp_code,
            totp_status,
            totp_begin_setup,
            totp_confirm_setup,
            totp_verify_unlock,
            totp_disable,
            add_generator_history_entry,
            get_generator_history,
            clear_generator_history,
            export_vault,
            import_vault,
            totp_backup_codes_remaining,
            totp_generate_backup_codes,
            totp_verify_backup_code,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
