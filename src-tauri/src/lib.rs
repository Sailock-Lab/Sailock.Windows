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

fn default_field_type() -> String {
    "text".to_string()
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct CustomField {
    label: String,
    value: String,
    // "text" | "password" | "number" | "boolean" | "date" | "time" | "url" | "select"
    #[serde(default = "default_field_type")]
    field_type: String,
    #[serde(default)]
    is_preset: bool,
    #[serde(default)]
    preset_key: Option<String>,
    // Solo para el tipo "select": opciones que define el usuario para ESE campo de ESE registro
    #[serde(default)]
    options: Vec<String>,
    // El valor se oculta por defecto y pide la contraseña maestra para verse (barrera de interfaz)
    #[serde(default)]
    sensitive: bool,
    // Ajustes propios de cada tipo (decimales, país, mínimo/máximo...). Cada tipo define los suyos.
    #[serde(default)]
    config: Option<serde_json::Value>,
}

// Campo de texto simple y sin plantilla. Usa los valores por defecto para el resto,
// así añadir campos nuevos a CustomField no obliga a tocar cada sitio que lo crea.
fn plain_field(label: &str, value: String) -> CustomField {
    CustomField {
        label: label.to_string(),
        value,
        field_type: "text".to_string(),
        ..Default::default()
    }
}

// Evento del historial de un registro. NUNCA guarda valores (contraseñas, notas...),
// solo qué cambió y cuándo. Vive dentro del propio registro, cifrado con el vault.
// No existe ningún comando para borrarlo: solo desaparece si se borra el registro.
#[derive(Serialize, Deserialize, Clone)]
struct HistoryEvent {
    timestamp: u64,
    // "created" | "field_modified" | "field_added" | "field_removed" | "field_renamed"
    // | "field_type_changed" | "field_options_changed" | "field_sensitivity_changed"
    // | "field_config_changed" | "avatar_changed" | "moved" | "trashed" | "restored"
    // | "favorite_added" | "favorite_removed"
    action: String,
    // Etiqueta del campo, o "builtin:<clave>" para los campos fijos (name, username, ...)
    #[serde(default)]
    field: Option<String>,
    // Dato extra: nombre nuevo de un campo renombrado, o carpeta de destino
    #[serde(default)]
    extra: Option<String>,
}

fn history_event(action: &str, field: Option<&str>, extra: Option<&str>) -> HistoryEvent {
    HistoryEvent {
        timestamp: now_millis(),
        action: action.to_string(),
        field: field.map(|s| s.to_string()),
        extra: extra.map(|s| s.to_string()),
    }
}

#[derive(Serialize, Deserialize, Clone)]
struct Entry {
    id: String,
    name: String,
    folder: Option<String>,
    #[serde(default)]
    folder_id: Option<String>,
    username: Option<String>,
    password: Option<String>,
    website: Option<String>,
    notes: Option<String>,
    #[serde(default)]
    custom_fields: Vec<CustomField>,
    #[serde(default)]
    totp_secret: Option<String>,
    #[serde(default)]
    entry_type: Option<String>,
    // Imagen que sube el usuario, ya reducida por el frontend (data URL).
    #[serde(default)]
    logo: Option<String>,
    // Cómo se muestra el registro: "type" (icono del tipo) | "initial" | "image"
    #[serde(default)]
    avatar_mode: Option<String>,
    // Ids de etiquetas (varias) y de categoría (una) de la lista global del vault
    #[serde(default)]
    tag_ids: Vec<String>,
    #[serde(default)]
    category_id: Option<String>,
    #[serde(default)]
    history: Vec<HistoryEvent>,
    #[serde(default)]
    favorite: bool,
    #[serde(default)]
    trashed: bool,
    created_at: u64,
    updated_at: u64,
}

// Tope de tamaño del logo (el frontend lo reduce a 128x128, pesa unos pocos KB)
const MAX_LOGO_LEN: usize = 150_000;

fn sanitize_logo(logo: Option<String>) -> Result<Option<String>, String> {
    match logo {
        None => Ok(None),
        Some(l) if l.is_empty() => Ok(None),
        Some(l) => {
            if !l.starts_with("data:image/") {
                return Err("Formato de logo no válido".into());
            }
            if l.len() > MAX_LOGO_LEN {
                return Err("El logo es demasiado grande".into());
            }
            Ok(Some(l))
        }
    }
}

fn sanitize_avatar_mode(mode: Option<String>) -> Option<String> {
    mode.filter(|m| m == "type" || m == "initial" || m == "image")
}

// Compara el registro guardado con la versión nueva y devuelve qué cambió.
// Solo registra QUÉ cambió, nunca los valores.
fn diff_entries(old: &Entry, new: &Entry) -> Vec<HistoryEvent> {
    let mut events: Vec<HistoryEvent> = Vec::new();

    if old.name != new.name {
        events.push(history_event("field_modified", Some("builtin:name"), None));
    }
    if old.username != new.username {
        events.push(history_event(
            "field_modified",
            Some("builtin:username"),
            None,
        ));
    }
    if old.password != new.password {
        events.push(history_event(
            "field_modified",
            Some("builtin:password"),
            None,
        ));
    }
    if old.website != new.website {
        events.push(history_event(
            "field_modified",
            Some("builtin:website"),
            None,
        ));
    }
    if old.notes != new.notes {
        events.push(history_event("field_modified", Some("builtin:notes"), None));
    }
    if old.totp_secret != new.totp_secret {
        events.push(history_event("field_modified", Some("builtin:totp"), None));
    }
    if old.logo != new.logo || old.avatar_mode != new.avatar_mode {
        events.push(history_event("avatar_changed", None, None));
    }

    let mut old_tags = old.tag_ids.clone();
    old_tags.sort();
    let mut new_tags = new.tag_ids.clone();
    new_tags.sort();
    if old_tags != new_tags {
        events.push(history_event("field_modified", Some("builtin:tags"), None));
    }
    if old.category_id != new.category_id {
        events.push(history_event(
            "field_modified",
            Some("builtin:category"),
            None,
        ));
    }

    // Campos extra y de plantilla: primero se emparejan por etiqueta
    let new_fields = &new.custom_fields;
    let mut old_used = vec![false; old.custom_fields.len()];
    let mut new_matched = vec![false; new_fields.len()];

    for (ni, nf) in new_fields.iter().enumerate() {
        let found = (0..old.custom_fields.len())
            .find(|&oi| !old_used[oi] && old.custom_fields[oi].label == nf.label);
        if let Some(oi) = found {
            old_used[oi] = true;
            new_matched[ni] = true;
            let of = &old.custom_fields[oi];
            if of.field_type != nf.field_type {
                events.push(history_event("field_type_changed", Some(&nf.label), None));
            }
            if of.options != nf.options {
                events.push(history_event(
                    "field_options_changed",
                    Some(&nf.label),
                    None,
                ));
            }
            if of.sensitive != nf.sensitive {
                events.push(history_event(
                    "field_sensitivity_changed",
                    Some(&nf.label),
                    None,
                ));
            }
            if of.config != nf.config {
                events.push(history_event("field_config_changed", Some(&nf.label), None));
            }
            if of.value != nf.value {
                events.push(history_event("field_modified", Some(&nf.label), None));
            }
        }
    }

    // Los que no se han emparejado: renombrado (mismo tipo y mismo valor), añadido o eliminado
    let mut old_left: Vec<usize> = (0..old.custom_fields.len())
        .filter(|&oi| !old_used[oi])
        .collect();

    for ni in 0..new_fields.len() {
        if new_matched[ni] {
            continue;
        }
        let nf = &new_fields[ni];
        let rename_pos = old_left.iter().position(|&oi| {
            let of = &old.custom_fields[oi];
            of.field_type == nf.field_type && of.value == nf.value
        });
        if let Some(pos) = rename_pos {
            let oi = old_left.remove(pos);
            events.push(history_event(
                "field_renamed",
                Some(&old.custom_fields[oi].label),
                Some(&nf.label),
            ));
        } else {
            events.push(history_event("field_added", Some(&nf.label), None));
        }
    }

    for oi in old_left {
        events.push(history_event(
            "field_removed",
            Some(&old.custom_fields[oi].label),
            None,
        ));
    }

    events
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
    folder_id: Option<String>,
    username: Option<String>,
    password: Option<String>,
    website: Option<String>,
    notes: Option<String>,
    custom_fields: Vec<CustomField>,
    totp_secret: Option<String>,
    entry_type: Option<String>,
    logo: Option<String>,
    avatar_mode: Option<String>,
    tag_ids: Vec<String>,
    category_id: Option<String>,
) -> Result<String, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;
    let logo = sanitize_logo(logo)?;
    let avatar_mode = sanitize_avatar_mode(avatar_mode);
    let (tag_ids, category_id) = clean_taxonomy_refs(&app_handle, &key, tag_ids, category_id);

    let path = vault_path(&app_handle);
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: VaultFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let mut entries = decrypt_entries(&key, &file.nonce, &file.ciphertext)?;

    let now = now_millis();
    let new_id = now.to_string();
    entries.push(Entry {
        id: new_id.clone(),
        name,
        folder,
        folder_id,
        username,
        password,
        website,
        notes,
        custom_fields,
        totp_secret,
        entry_type,
        logo,
        avatar_mode,
        tag_ids,
        category_id,
        history: vec![history_event("created", None, None)],
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

    Ok(new_id)
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
    entry_type: Option<String>,
    logo: Option<String>,
    avatar_mode: Option<String>,
    tag_ids: Vec<String>,
    category_id: Option<String>,
) -> Result<(), String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;
    let logo = sanitize_logo(logo)?;
    let avatar_mode = sanitize_avatar_mode(avatar_mode);
    let (tag_ids, category_id) = clean_taxonomy_refs(&app_handle, &key, tag_ids, category_id);

    let path = vault_path(&app_handle);
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: VaultFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let mut entries = decrypt_entries(&key, &file.nonce, &file.ciphertext)?;

    let now = now_millis();
    let mut found = false;
    for entry in entries.iter_mut() {
        if entry.id == id {
            // Se construye la versión nueva y se calcula qué ha cambiado antes de guardarla
            let mut updated = entry.clone();
            updated.name = name.clone();
            updated.folder = folder.clone();
            updated.username = username.clone();
            updated.password = password.clone();
            updated.website = website.clone();
            updated.notes = notes.clone();
            updated.custom_fields = custom_fields.clone();
            updated.totp_secret = totp_secret.clone();
            updated.entry_type = entry_type.clone();
            updated.logo = logo.clone();
            updated.avatar_mode = avatar_mode.clone();
            updated.tag_ids = tag_ids.clone();
            updated.category_id = category_id.clone();
            let events = diff_entries(entry, &updated);
            updated.history.extend(events);
            updated.updated_at = now;
            *entry = updated;
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
    master_password: String,
) -> Result<(), String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let path = vault_path(&app_handle);
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: VaultFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    // El borrado permanente es irreversible, así que la contraseña maestra se exige aquí,
    // en el backend: nunca te fíes solo de lo que el frontend diga que verificó.
    // Se usa un código de error estable para que la interfaz lo traduzca.
    let salt_bytes = B64.decode(&file.salt).map_err(|e| e.to_string())?;
    let candidate_key = derive_key(&master_password, &salt_bytes);
    if decrypt_entries(&candidate_key, &file.nonce, &file.ciphertext).is_err() {
        return Err("INVALID_MASTER_PASSWORD".to_string());
    }

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
            let action = if entry.favorite {
                "favorite_added"
            } else {
                "favorite_removed"
            };
            entry.history.push(history_event(action, None, None));
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
            entry.history.push(history_event("trashed", None, None));
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
            entry.history.push(history_event("restored", None, None));
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
            plain_field("Alfabeto", batch.alphabet),
            plain_field("Longitud", batch.length.to_string()),
            plain_field("Número de códigos", batch.count.to_string()),
            plain_field("Códigos", batch.codes.join(", ")),
        ],
        totp_secret: None,
        entry_type: None,
        logo: None,
        avatar_mode: None,
        tag_ids: Vec::new(),
        category_id: None,
        history: vec![history_event("created", None, None)],
        folder_id: None,
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

// Comprueba la contraseña maestra dentro del backend (para acciones que no se fían del frontend).
fn require_master_password(app_handle: &tauri::AppHandle, master_password: &str) -> Result<(), String> {
    let ok = verify_master_password(app_handle.clone(), master_password.to_string())?;
    if ok {
        Ok(())
    } else {
        Err("Contraseña maestra incorrecta".into())
    }
}

// ---------- Control de la ventana (atajos de teclado) ----------

fn main_window(app_handle: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
    app_handle
        .get_webview_window("main")
        .or_else(|| app_handle.webview_windows().into_values().next())
        .ok_or_else(|| "No se encontró la ventana".to_string())
}

#[tauri::command]
fn window_minimize(app_handle: tauri::AppHandle) -> Result<(), String> {
    main_window(&app_handle)?.minimize().map_err(|e| e.to_string())
}

// Alterna la pantalla completa y devuelve el estado nuevo.
#[tauri::command]
fn window_toggle_fullscreen(app_handle: tauri::AppHandle) -> Result<bool, String> {
    let window = main_window(&app_handle)?;
    let next = !window.is_fullscreen().map_err(|e| e.to_string())?;
    window.set_fullscreen(next).map_err(|e| e.to_string())?;
    Ok(next)
}

#[tauri::command]
fn window_set_always_on_top(app_handle: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    main_window(&app_handle)?
        .set_always_on_top(enabled)
        .map_err(|e| e.to_string())
}

// Zoom de la interfaz (1.0 = 100 %).
#[tauri::command]
fn window_set_zoom(app_handle: tauri::AppHandle, factor: f64) -> Result<(), String> {
    main_window(&app_handle)?
        .set_zoom(factor.clamp(0.5, 3.0))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

// ---------- Cambio de contraseña maestra ----------

// Vuelve a cifrar un fichero {nonce, ciphertext} (carpetas, etiquetas, plantillas...) con la clave nueva.
// Devuelve None si el fichero no se puede leer con la clave actual (en ese caso se deja como está).
fn reencrypt_blob(content: &str, old_key: &[u8; 32], new_key: &[u8; 32]) -> Option<String> {
    let file: TaxonomyFile = serde_json::from_str(content).ok()?;
    let nonce_bytes = B64.decode(&file.nonce).ok()?;
    if nonce_bytes.len() != 12 {
        return None;
    }
    let ciphertext = B64.decode(&file.ciphertext).ok()?;
    let old_cipher = Aes256Gcm::new_from_slice(old_key).ok()?;
    let plaintext = old_cipher
        .decrypt(Nonce::from_slice(&nonce_bytes), ciphertext.as_ref())
        .ok()?;

    let new_cipher = Aes256Gcm::new_from_slice(new_key).ok()?;
    let mut new_nonce = [0u8; 12];
    AeadOsRng.fill_bytes(&mut new_nonce);
    let new_ciphertext = new_cipher
        .encrypt(Nonce::from_slice(&new_nonce), plaintext.as_ref())
        .ok()?;
    serde_json::to_string_pretty(&TaxonomyFile {
        nonce: B64.encode(new_nonce),
        ciphertext: B64.encode(new_ciphertext),
    })
    .ok()
}

// Cambia la contraseña maestra: genera una sal nueva, deriva la clave nueva y vuelve a cifrar el vault
// y todos los ficheros cifrados con ella. Si algo falla a medias, se restauran los ficheros originales.
#[tauri::command]
fn change_master_password(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    current_password: String,
    new_password: String,
) -> Result<(), String> {
    if new_password.is_empty() {
        return Err("La nueva contraseña no puede estar vacía".into());
    }
    if new_password == current_password {
        return Err("La nueva contraseña debe ser distinta de la actual".into());
    }

    // El bloqueo se mantiene durante todo el cambio para que nada escriba con la clave antigua a mitad.
    let mut key_guard = state.key.lock().unwrap();
    if key_guard.is_none() {
        return Err("El vault está bloqueado".into());
    }

    let vault_file_path = vault_path(&app_handle);
    let content = fs::read_to_string(&vault_file_path).map_err(|e| e.to_string())?;
    let file: VaultFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let salt_bytes = B64.decode(&file.salt).map_err(|e| e.to_string())?;
    let old_key = derive_key(&current_password, &salt_bytes);
    // Si la contraseña actual es incorrecta, falla aquí
    let entries = decrypt_entries(&old_key, &file.nonce, &file.ciphertext)?;

    let mut new_salt = [0u8; 16];
    AeadOsRng.fill_bytes(&mut new_salt);
    let new_key = derive_key(&new_password, &new_salt);
    let (nonce, ciphertext) = encrypt_entries(&new_key, &entries);
    let new_vault = VaultFile {
        salt: B64.encode(new_salt),
        nonce,
        ciphertext,
    };

    // Contenido nuevo de cada fichero (el vault y los que existan de los demás)
    let mut writes: Vec<(PathBuf, String)> = vec![(
        vault_file_path,
        serde_json::to_string_pretty(&new_vault).map_err(|e| e.to_string())?,
    )];
    for p in [
        folders_path(&app_handle),
        taxonomy_path(&app_handle),
        templates_path(&app_handle),
        generator_history_path(&app_handle),
        totp_settings_path(&app_handle),
        totp_accounts_path(&app_handle),
        notes_path(&app_handle),
        notifications_path(&app_handle),
        backup_config_path(&app_handle),
    ] {
        if !p.exists() {
            continue;
        }
        let existing = fs::read_to_string(&p).map_err(|e| e.to_string())?;
        if let Some(new_content) = reencrypt_blob(&existing, &old_key, &new_key) {
            writes.push((p, new_content));
        }
    }

    let tmp_of = |p: &PathBuf| p.with_extension("json.tmp");
    let bak_of = |p: &PathBuf| p.with_extension("json.bak");
    let cleanup = |writes: &[(PathBuf, String)]| {
        for (p, _) in writes {
            let _ = fs::remove_file(tmp_of(p));
            let _ = fs::remove_file(bak_of(p));
        }
    };

    // 1) Escribir todo en ficheros temporales y 2) guardar copia de los originales
    for (p, new_content) in &writes {
        if let Err(e) = fs::write(tmp_of(p), new_content) {
            cleanup(&writes);
            return Err(e.to_string());
        }
    }
    for (p, _) in &writes {
        if let Err(e) = fs::copy(p, bak_of(p)) {
            cleanup(&writes);
            return Err(e.to_string());
        }
    }
    // 3) Sustituir los originales; si uno falla, se restauran los ya sustituidos
    for (i, (p, _)) in writes.iter().enumerate() {
        if let Err(e) = fs::rename(tmp_of(p), p) {
            for (done, _) in writes.iter().take(i) {
                let _ = fs::copy(bak_of(done), done);
            }
            cleanup(&writes);
            return Err(e.to_string());
        }
    }
    cleanup(&writes);

    *key_guard = Some(new_key);
    Ok(())
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
    let folders_file = folders_path(&app_handle);
    if folders_file.exists() {
        let _ = fs::remove_file(&folders_file);
    }
    let taxonomy_file = taxonomy_path(&app_handle);
    if taxonomy_file.exists() {
        let _ = fs::remove_file(&taxonomy_file);
    }
    let templates_file = templates_path(&app_handle);
    if templates_file.exists() {
        let _ = fs::remove_file(&templates_file);
    }
    let totp_accounts_file = totp_accounts_path(&app_handle);
    if totp_accounts_file.exists() {
        let _ = fs::remove_file(&totp_accounts_file);
    }
    let notes_file = notes_path(&app_handle);
    if notes_file.exists() {
        let _ = fs::remove_file(&notes_file);
    }
    let notifications_file = notifications_path(&app_handle);
    if notifications_file.exists() {
        let _ = fs::remove_file(&notifications_file);
    }
    let backup_config_file = backup_config_path(&app_handle);
    if backup_config_file.exists() {
        let _ = fs::remove_file(&backup_config_file);
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

    let local_taxonomy = read_taxonomy(&app_handle, &local_key);
    let base_time = now_millis();
    for (i, mut entry) in final_imported.into_iter().enumerate() {
        entry.id = format!("{}-{}", base_time, i);
        // Las etiquetas y categorías no viajan en el archivo: solo se conservan las que existan aquí
        entry
            .tag_ids
            .retain(|t| local_taxonomy.tags.iter().any(|x| &x.id == t));
        if let Some(c) = &entry.category_id {
            if !local_taxonomy.categories.iter().any(|x| &x.id == c) {
                entry.category_id = None;
            }
        }
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
// ---------- Copias de seguridad (formato 2) ----------
// Un archivo .slock cifrado con una contraseña propia del archivo. Dentro lleva solo las secciones que el usuario
// eligió. Los archivos antiguos (solo registros) siguen pudiéndose importar.

const BACKUP_SECTIONS: [&str; 7] = [
    "entries",
    "folders",
    "taxonomy",
    "templates",
    "notes",
    "totp",
    "settings",
];
const MAX_BACKUP_SETTINGS_LEN: usize = 100_000;
const MAX_NOTES: usize = 1000;
const MAX_TOTP_ACCOUNTS: usize = 200;

#[derive(Serialize, Deserialize, Default)]
struct BackupPayload {
    #[serde(default)]
    version: u32,
    #[serde(default)]
    created_at: u64,
    #[serde(default)]
    entries: Option<Vec<Entry>>,
    #[serde(default)]
    folders: Option<Vec<Folder>>,
    #[serde(default)]
    taxonomy: Option<Taxonomy>,
    #[serde(default)]
    templates: Option<Vec<UserTemplate>>,
    #[serde(default)]
    notes: Option<Vec<Note>>,
    #[serde(default)]
    totp_accounts: Option<Vec<TotpAccount>>,
    // Preferencias de la interfaz (viven en el frontend): se devuelven tal cual al importar.
    #[serde(default)]
    settings: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize)]
struct BackupFile {
    format: u32,
    salt: String,
    nonce: String,
    ciphertext: String,
}

#[derive(Serialize, Default)]
struct BackupImportSummary {
    entries: usize,
    folders: usize,
    tags: usize,
    categories: usize,
    templates: usize,
    notes: usize,
    totp_accounts: usize,
    settings: Option<serde_json::Value>,
}

fn encrypt_bytes(key: &[u8; 32], plaintext: &[u8]) -> Result<(String, String), String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    AeadOsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, plaintext).map_err(|e| e.to_string())?;
    Ok((B64.encode(nonce_bytes), B64.encode(ciphertext)))
}

fn decrypt_bytes(key: &[u8; 32], nonce_b64: &str, ciphertext_b64: &str) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let nonce_bytes = B64.decode(nonce_b64).map_err(|e| e.to_string())?;
    let ciphertext = B64.decode(ciphertext_b64).map_err(|e| e.to_string())?;
    if nonce_bytes.len() != 12 {
        return Err("Archivo no válido".into());
    }
    cipher
        .decrypt(Nonce::from_slice(&nonce_bytes), ciphertext.as_ref())
        .map_err(|_| "Contraseña incorrecta para este archivo".to_string())
}

// `sections`: qué incluir ("entries", "folders", "taxonomy", "templates", "notes", "totp", "settings").
// `settings`: JSON con las preferencias de la interfaz, que solo el frontend conoce.
#[tauri::command]
fn export_backup(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    export_password: String,
    sections: Vec<String>,
    settings: Option<String>,
) -> Result<String, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let local_key = key_opt.ok_or("El vault está bloqueado")?;
    build_backup_file(&app_handle, &local_key, &export_password, &sections, settings)
}

// Construye el contenido cifrado de una copia (formato 2). Lo usan la exportación manual y las copias automáticas.
fn build_backup_file(
    app_handle: &tauri::AppHandle,
    local_key: &[u8; 32],
    export_password: &str,
    sections: &[String],
    settings: Option<String>,
) -> Result<String, String> {
    if export_password.chars().count() < 8 {
        return Err("La contraseña del archivo debe tener al menos 8 caracteres".into());
    }
    if sections.is_empty() || sections.iter().any(|s| !BACKUP_SECTIONS.contains(&s.as_str())) {
        return Err("Selección de copia no válida".into());
    }
    let wants = |name: &str| sections.iter().any(|s| s == name);

    let mut payload = BackupPayload {
        version: 2,
        created_at: now_millis(),
        ..Default::default()
    };
    if wants("entries") {
        let local_path = vault_path(&app_handle);
        let local_content = fs::read_to_string(&local_path).map_err(|e| e.to_string())?;
        let local_file: VaultFile = serde_json::from_str(&local_content).map_err(|e| e.to_string())?;
        payload.entries = Some(decrypt_entries(&local_key, &local_file.nonce, &local_file.ciphertext)?);
    }
    if wants("folders") {
        payload.folders = Some(read_folders(&app_handle, &local_key));
    }
    if wants("taxonomy") {
        payload.taxonomy = Some(read_taxonomy(&app_handle, &local_key));
    }
    if wants("templates") {
        payload.templates = Some(read_templates(&app_handle, &local_key));
    }
    if wants("notes") {
        payload.notes = Some(read_notes(&app_handle, &local_key));
    }
    if wants("totp") {
        payload.totp_accounts = Some(read_totp_accounts(&app_handle, &local_key));
    }
    if wants("settings") {
        if let Some(raw) = settings {
            if raw.len() > MAX_BACKUP_SETTINGS_LEN {
                return Err("Las preferencias son demasiado grandes".into());
            }
            payload.settings = Some(serde_json::from_str(&raw).map_err(|e| e.to_string())?);
        }
    }

    // Se cifra con una contraseña NUEVA, propia del archivo — nunca con la contraseña maestra real
    let mut salt_bytes = [0u8; 16];
    AeadOsRng.fill_bytes(&mut salt_bytes);
    let export_key = derive_key(&export_password, &salt_bytes);
    let plaintext = serde_json::to_vec(&payload).map_err(|e| e.to_string())?;
    let (nonce, ciphertext) = encrypt_bytes(&export_key, &plaintext)?;
    let file = BackupFile {
        format: 2,
        salt: B64.encode(salt_bytes),
        nonce,
        ciphertext,
    };
    serde_json::to_string_pretty(&file).map_err(|e| e.to_string())
}

// ---------- Copias automáticas ----------
// La configuración se guarda cifrada con la clave del vault en backup_config.json (incluye la contraseña de las
// copias, que por eso solo se puede usar con la app desbloqueada). No viaja dentro de las copias.

const MAX_BACKUP_FILE_NAME: usize = 120;
const MAX_BACKUP_PREFIX: usize = 40;

#[derive(Serialize, Deserialize, Clone)]
#[serde(default)]
struct BackupConfig {
    enabled: bool,
    folder: String,
    password: String,
    frequency_days: u32,
    prefix: String,
    date_format: String,
    sections: Vec<String>,
    keep: u32,
    last_run: u64,
}

impl Default for BackupConfig {
    fn default() -> Self {
        BackupConfig {
            enabled: false,
            folder: String::new(),
            password: String::new(),
            frequency_days: 7,
            prefix: "sailock-backup".to_string(),
            date_format: "dateTime".to_string(),
            sections: BACKUP_SECTIONS.iter().map(|s| s.to_string()).collect(),
            keep: 10,
            last_run: 0,
        }
    }
}

#[derive(Serialize)]
struct BackupConfigView {
    enabled: bool,
    folder: String,
    has_password: bool,
    frequency_days: u32,
    prefix: String,
    date_format: String,
    sections: Vec<String>,
    keep: u32,
    last_run: u64,
}

#[derive(Deserialize)]
struct BackupConfigInput {
    enabled: bool,
    folder: String,
    // None conserva la guardada
    password: Option<String>,
    frequency_days: u32,
    prefix: String,
    date_format: String,
    sections: Vec<String>,
    keep: u32,
}

#[derive(Serialize, Deserialize)]
struct BackupConfigFile {
    nonce: String,
    ciphertext: String,
}

fn backup_config_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let dir = app_handle
        .path()
        .app_data_dir()
        .expect("no se pudo obtener la carpeta de datos de la app");
    fs::create_dir_all(&dir).ok();
    dir.join("backup_config.json")
}

fn read_backup_config(app_handle: &tauri::AppHandle, key: &[u8; 32]) -> BackupConfig {
    let path = backup_config_path(app_handle);
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return BackupConfig::default(),
    };
    let file: BackupConfigFile = match serde_json::from_str(&content) {
        Ok(f) => f,
        Err(_) => return BackupConfig::default(),
    };
    match decrypt_bytes(key, &file.nonce, &file.ciphertext) {
        Ok(plaintext) => serde_json::from_slice(&plaintext).unwrap_or_default(),
        Err(_) => BackupConfig::default(),
    }
}

fn write_backup_config(
    app_handle: &tauri::AppHandle,
    key: &[u8; 32],
    config: &BackupConfig,
) -> Result<(), String> {
    let plaintext = serde_json::to_vec(config).map_err(|e| e.to_string())?;
    let (nonce, ciphertext) = encrypt_bytes(key, &plaintext)?;
    let json = serde_json::to_string_pretty(&BackupConfigFile { nonce, ciphertext })
        .map_err(|e| e.to_string())?;
    fs::write(backup_config_path(app_handle), json).map_err(|e| e.to_string())
}

fn backup_name_chars_ok(name: &str) -> bool {
    name.chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

fn valid_backup_prefix(prefix: &str) -> bool {
    !prefix.is_empty()
        && prefix.len() <= MAX_BACKUP_PREFIX
        && !prefix.starts_with('.')
        && backup_name_chars_ok(prefix)
}

fn valid_backup_file_name(name: &str) -> bool {
    name.len() <= MAX_BACKUP_FILE_NAME
        && name.len() > ".slock".len()
        && name.ends_with(".slock")
        && !name.starts_with('.')
        && backup_name_chars_ok(name)
}

fn backup_config_view(config: &BackupConfig) -> BackupConfigView {
    BackupConfigView {
        enabled: config.enabled,
        folder: config.folder.clone(),
        has_password: !config.password.is_empty(),
        frequency_days: config.frequency_days,
        prefix: config.prefix.clone(),
        date_format: config.date_format.clone(),
        sections: config.sections.clone(),
        keep: config.keep,
        last_run: config.last_run,
    }
}

#[tauri::command]
fn get_backup_config(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
) -> Result<BackupConfigView, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;
    Ok(backup_config_view(&read_backup_config(&app_handle, &key)))
}

#[tauri::command]
fn set_backup_config(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    config: BackupConfigInput,
) -> Result<BackupConfigView, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    if config.frequency_days == 0 || config.frequency_days > 365 {
        return Err("La frecuencia debe estar entre 1 y 365 días".into());
    }
    if config.keep > 200 {
        return Err("Número de copias a conservar no válido".into());
    }
    if !valid_backup_prefix(&config.prefix) {
        return Err("El prefijo del nombre no es válido".into());
    }
    if !["dateTime", "date", "compact", "eu", "none"].contains(&config.date_format.as_str()) {
        return Err("Formato de fecha no válido".into());
    }
    if config.sections.is_empty()
        || config
            .sections
            .iter()
            .any(|s| !BACKUP_SECTIONS.contains(&s.as_str()))
    {
        return Err("Selección de copia no válida".into());
    }
    let folder = config.folder.trim().to_string();
    if !folder.is_empty() && !std::path::Path::new(&folder).is_dir() {
        return Err("La carpeta elegida no existe".into());
    }

    let mut stored = read_backup_config(&app_handle, &key);
    if let Some(new_password) = config.password {
        if !new_password.is_empty() {
            if new_password.chars().count() < 8 {
                return Err("La contraseña de las copias debe tener al menos 8 caracteres".into());
            }
            stored.password = new_password;
        }
    }
    if config.enabled && (folder.is_empty() || stored.password.is_empty()) {
        return Err("Para activar las copias automáticas elige una carpeta y una contraseña".into());
    }

    stored.enabled = config.enabled;
    stored.folder = folder;
    stored.frequency_days = config.frequency_days;
    stored.prefix = config.prefix;
    stored.date_format = config.date_format;
    stored.sections = config.sections;
    stored.keep = config.keep;
    write_backup_config(&app_handle, &key, &stored)?;
    Ok(backup_config_view(&stored))
}

#[tauri::command]
async fn pick_backup_folder(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    match app_handle.dialog().file().blocking_pick_folder() {
        Some(picked) => {
            let path = picked.into_path().map_err(|e| e.to_string())?;
            Ok(Some(path.to_string_lossy().to_string()))
        }
        None => Ok(None),
    }
}

// Borra las copias más antiguas de esta configuración (mismo prefijo) y deja las `keep` más recientes.
// Solo toca ficheros .slock cuyo nombre empieza por "<prefijo>_" o es exactamente "<prefijo>.slock".
fn prune_backups(folder: &std::path::Path, prefix: &str, keep: u32) {
    if keep == 0 {
        return;
    }
    let exact = format!("{}.slock", prefix);
    let start = format!("{}_", prefix);
    let mut files: Vec<(SystemTime, PathBuf)> = fs::read_dir(folder)
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.ends_with(".slock") || !(name == exact || name.starts_with(&start)) {
                return None;
            }
            let meta = entry.metadata().ok()?;
            if !meta.is_file() {
                return None;
            }
            Some((meta.modified().ok()?, entry.path()))
        })
        .collect();
    files.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, path) in files.into_iter().skip(keep as usize) {
        let _ = fs::remove_file(path);
    }
}

// Crea ahora una copia en la carpeta configurada. `file_name` lo calcula el frontend con el prefijo y el formato
// de fecha; aquí solo se valida. Devuelve la ruta del fichero creado.
#[tauri::command]
fn run_backup_now(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    file_name: String,
    settings: Option<String>,
) -> Result<String, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let mut config = read_backup_config(&app_handle, &key);
    if config.folder.is_empty() || config.password.is_empty() {
        return Err("Configura una carpeta y una contraseña para las copias".into());
    }
    if !valid_backup_file_name(&file_name) {
        return Err("Nombre de fichero no válido".into());
    }
    let folder = PathBuf::from(&config.folder);
    if !folder.is_dir() {
        return Err("La carpeta de copias ya no existe".into());
    }

    let content = build_backup_file(&app_handle, &key, &config.password, &config.sections, settings)?;
    let target = folder.join(&file_name);
    let tmp = folder.join(format!("{}.tmp", file_name));
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    if let Err(e) = fs::rename(&tmp, &target) {
        let _ = fs::remove_file(&tmp);
        return Err(e.to_string());
    }

    config.last_run = now_millis();
    write_backup_config(&app_handle, &key, &config)?;
    prune_backups(&folder, &config.prefix, config.keep);
    Ok(target.to_string_lossy().to_string())
}

// Importa todas las secciones que traiga el archivo.
// `mode`: "add_duplicates" | "skip_duplicates" | "replace_all" (esta última sustituye solo las secciones presentes).
#[tauri::command]
fn import_backup(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    file_content: String,
    export_password: String,
    mode: String,
) -> Result<BackupImportSummary, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let local_key = key_opt.ok_or("El vault está bloqueado")?;
    if !["add_duplicates", "skip_duplicates", "replace_all"].contains(&mode.as_str()) {
        return Err("Modo de importación no válido".into());
    }
    let replace = mode == "replace_all";

    let imported_file: VaultFile = serde_json::from_str(&file_content)
        .map_err(|_| "El archivo no tiene un formato válido de Sailock".to_string())?;
    let imported_salt = B64.decode(&imported_file.salt).map_err(|e| e.to_string())?;
    let imported_key = derive_key(&export_password, &imported_salt);
    let plaintext = decrypt_bytes(&imported_key, &imported_file.nonce, &imported_file.ciphertext)?;

    // Los archivos antiguos son una lista de registros; los nuevos, un objeto con secciones.
    let is_legacy = plaintext
        .iter()
        .find(|b| !b.is_ascii_whitespace())
        .map_or(false, |b| *b == b'[');
    let payload: BackupPayload = if is_legacy {
        BackupPayload {
            version: 1,
            entries: Some(
                serde_json::from_slice(&plaintext)
                    .map_err(|_| "El archivo no tiene un formato válido de Sailock".to_string())?,
            ),
            ..Default::default()
        }
    } else {
        serde_json::from_slice(&plaintext)
            .map_err(|_| "El archivo no tiene un formato válido de Sailock".to_string())?
    };

    let mut summary = BackupImportSummary::default();

    // Carpetas: se unen por id (o sustituyen a las actuales).
    let mut folders = if replace && payload.folders.is_some() {
        Vec::new()
    } else {
        read_folders(&app_handle, &local_key)
    };
    if let Some(imported) = payload.folders {
        for f in imported {
            if !folders.iter().any(|x| x.id == f.id) {
                folders.push(f);
                summary.folders += 1;
            }
        }
        write_folders(&app_handle, &local_key, &folders);
    }

    // Etiquetas y categorías: si ya existe una con el mismo nombre se reutiliza (y los registros apuntan a ella).
    let mut taxonomy = if replace && payload.taxonomy.is_some() {
        Taxonomy::default()
    } else {
        read_taxonomy(&app_handle, &local_key)
    };
    let mut tag_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut category_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    if let Some(imported) = payload.taxonomy {
        for (list, source, map, counter) in [
            (&mut taxonomy.tags, imported.tags, &mut tag_map, &mut summary.tags),
            (
                &mut taxonomy.categories,
                imported.categories,
                &mut category_map,
                &mut summary.categories,
            ),
        ] {
            for item in source {
                if let Some(existing) = list
                    .iter()
                    .find(|x| x.id == item.id || x.name.to_lowercase() == item.name.to_lowercase())
                {
                    map.insert(item.id.clone(), existing.id.clone());
                } else {
                    map.insert(item.id.clone(), item.id.clone());
                    list.push(item);
                    *counter += 1;
                }
            }
        }
        write_taxonomy(&app_handle, &local_key, &taxonomy)?;
    }

    // Registros
    if let Some(imported_entries) = payload.entries {
        let local_path = vault_path(&app_handle);
        let local_content = fs::read_to_string(&local_path).map_err(|e| e.to_string())?;
        let local_file: VaultFile = serde_json::from_str(&local_content).map_err(|e| e.to_string())?;
        let mut local_entries = decrypt_entries(&local_key, &local_file.nonce, &local_file.ciphertext)?;

        let final_imported: Vec<Entry> = if mode == "skip_duplicates" {
            let existing_names: std::collections::HashSet<String> =
                local_entries.iter().map(|e| e.name.to_lowercase()).collect();
            imported_entries
                .into_iter()
                .filter(|e| !existing_names.contains(&e.name.to_lowercase()))
                .collect()
        } else {
            imported_entries
        };
        summary.entries = final_imported.len();
        if replace {
            local_entries = Vec::new();
        }

        let base_time = now_millis();
        for (i, mut entry) in final_imported.into_iter().enumerate() {
            entry.id = format!("{}-{}", base_time, i);
            let mut tags: Vec<String> = Vec::new();
            for t in entry.tag_ids.iter() {
                let mapped = tag_map.get(t).unwrap_or(t).clone();
                if taxonomy.tags.iter().any(|x| x.id == mapped) && !tags.contains(&mapped) {
                    tags.push(mapped);
                }
            }
            entry.tag_ids = tags;
            entry.category_id = entry.category_id.as_ref().and_then(|c| {
                let mapped = category_map.get(c).unwrap_or(c).clone();
                taxonomy.categories.iter().any(|x| x.id == mapped).then_some(mapped)
            });
            if let Some(fid) = &entry.folder_id {
                if !folders.iter().any(|f| &f.id == fid) {
                    entry.folder_id = None;
                }
            }
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
    }

    // Plantillas, notas y códigos TOTP sueltos: se añaden los que no existan (por id).
    if let Some(imported) = payload.templates {
        let mut list = if replace { Vec::new() } else { read_templates(&app_handle, &local_key) };
        for t in imported {
            if !t.id.is_empty() && !list.iter().any(|x| x.id == t.id) {
                list.push(t);
                summary.templates += 1;
            }
        }
        write_templates(&app_handle, &local_key, &list)?;
    }
    if let Some(imported) = payload.notes {
        let mut list = if replace { Vec::new() } else { read_notes(&app_handle, &local_key) };
        for n in imported {
            if list.len() >= MAX_NOTES {
                break;
            }
            if !n.id.is_empty() && !list.iter().any(|x| x.id == n.id) {
                list.push(n);
                summary.notes += 1;
            }
        }
        write_notes(&app_handle, &local_key, &list)?;
    }
    if let Some(imported) = payload.totp_accounts {
        let mut list = if replace { Vec::new() } else { read_totp_accounts(&app_handle, &local_key) };
        for a in imported {
            if list.len() >= MAX_TOTP_ACCOUNTS {
                break;
            }
            if !a.id.is_empty() && !list.iter().any(|x| x.id == a.id) {
                list.push(a);
                summary.totp_accounts += 1;
            }
        }
        write_totp_accounts(&app_handle, &local_key, &list)?;
    }

    summary.settings = payload.settings;
    Ok(summary)
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

// Sección TOTP en registro
fn build_totp(secret_input: &str, account_name: &str) -> Result<TOTP, String> {
    let mut secret_text = secret_input.trim().to_string();
    let mut algorithm = Algorithm::SHA1;
    let mut digits: usize = 6;
    let mut step: u64 = 30;

    if secret_text.to_lowercase().starts_with("otpauth://") {
        let query = secret_text
            .split_once('?')
            .map(|(_, q)| q.to_string())
            .ok_or("La URL otpauth no incluye parámetros")?;
        let mut found_secret: Option<String> = None;
        for pair in query.split('&') {
            let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
            match key.to_lowercase().as_str() {
                "secret" => found_secret = Some(value.to_string()),
                "algorithm" => {
                    algorithm = match value.to_uppercase().as_str() {
                        "SHA256" => Algorithm::SHA256,
                        "SHA512" => Algorithm::SHA512,
                        _ => Algorithm::SHA1,
                    }
                }
                "digits" => {
                    if let Ok(d) = value.parse::<usize>() {
                        if (6..=8).contains(&d) {
                            digits = d;
                        }
                    }
                }
                "period" => {
                    if let Ok(p) = value.parse::<u64>() {
                        if p > 0 {
                            step = p;
                        }
                    }
                }
                _ => {}
            }
        }
        secret_text = found_secret.ok_or("La URL otpauth no incluye el secreto")?;
    }

    let normalized: String = secret_text
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-' && *c != '=')
        .collect::<String>()
        .to_uppercase();
    if normalized.is_empty() {
        return Err("El secreto está vacío".into());
    }

    let bytes = Secret::Encoded(normalized).to_bytes().map_err(|_| {
        "El secreto no es un código base32 válido (solo letras A-Z y números 2-7)".to_string()
    })?;

    Ok(TOTP::new_unchecked(
        algorithm,
        digits,
        1,
        step,
        bytes,
        Some("Sailock".to_string()),
        account_name.to_string(),
    ))
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

// ---------- Carpetas del Vault ----------

#[derive(Serialize, Deserialize, Clone)]
struct Folder {
    id: String,
    name: String,
    parent_id: Option<String>,
    created_at: u64,
}

#[derive(Serialize, Deserialize)]
struct FoldersFile {
    nonce: String,
    ciphertext: String,
}

fn folders_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let dir = app_handle
        .path()
        .app_data_dir()
        .expect("no se pudo obtener la carpeta de datos de la app");
    fs::create_dir_all(&dir).ok();
    dir.join("folders.json")
}

fn read_folders(app_handle: &tauri::AppHandle, key: &[u8; 32]) -> Vec<Folder> {
    let path = folders_path(app_handle);
    if !path.exists() {
        return Vec::new();
    }
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    let file: FoldersFile = match serde_json::from_str(&content) {
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

fn write_folders(app_handle: &tauri::AppHandle, key: &[u8; 32], folders: &[Folder]) {
    let cipher = match Aes256Gcm::new_from_slice(key) {
        Ok(c) => c,
        Err(_) => return,
    };
    let mut nonce_bytes = [0u8; 12];
    AeadOsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = match serde_json::to_vec(folders) {
        Ok(p) => p,
        Err(_) => return,
    };
    let ciphertext = match cipher.encrypt(nonce, plaintext.as_ref()) {
        Ok(c) => c,
        Err(_) => return,
    };
    let file = FoldersFile {
        nonce: B64.encode(nonce_bytes),
        ciphertext: B64.encode(ciphertext),
    };
    if let Ok(json) = serde_json::to_string_pretty(&file) {
        let path = folders_path(app_handle);
        let _ = fs::write(&path, json);
    }
}

#[tauri::command]
fn load_folders(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
) -> Result<Vec<Folder>, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;
    Ok(read_folders(&app_handle, &key))
}

#[tauri::command]
fn create_folder(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    name: String,
    parent_id: Option<String>,
) -> Result<Folder, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let mut folders = read_folders(&app_handle, &key);
    let now = now_millis();
    let folder = Folder {
        id: now.to_string(),
        name,
        parent_id,
        created_at: now,
    };
    folders.push(folder.clone());
    write_folders(&app_handle, &key, &folders);
    Ok(folder)
}

#[tauri::command]
fn rename_folder(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    id: String,
    name: String,
) -> Result<(), String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let mut folders = read_folders(&app_handle, &key);
    let mut found = false;
    for folder in folders.iter_mut() {
        if folder.id == id {
            folder.name = name.clone();
            found = true;
            break;
        }
    }
    if !found {
        return Err("No se encontró la carpeta".into());
    }
    write_folders(&app_handle, &key, &folders);
    Ok(())
}

#[tauri::command]
fn delete_folder(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    id: String,
) -> Result<(), String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let folders = read_folders(&app_handle, &key);
    let has_subfolders = folders
        .iter()
        .any(|f| f.parent_id.as_deref() == Some(id.as_str()));
    if has_subfolders {
        return Err("La carpeta tiene subcarpetas dentro. Vacíala primero.".into());
    }

    let path = vault_path(&app_handle);
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: VaultFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let entries = decrypt_entries(&key, &file.nonce, &file.ciphertext)?;
    let has_entries = entries
        .iter()
        .any(|e| e.folder_id.as_deref() == Some(id.as_str()) && !e.trashed);
    if has_entries {
        return Err("La carpeta tiene registros dentro. Vacíala primero.".into());
    }

    let mut folders = folders;
    folders.retain(|f| f.id != id);
    write_folders(&app_handle, &key, &folders);
    Ok(())
}

fn is_descendant_or_self(folders: &[Folder], candidate_id: &str, ancestor_id: &str) -> bool {
    let mut current = Some(candidate_id.to_string());
    while let Some(cur) = current {
        if cur == ancestor_id {
            return true;
        }
        current = folders
            .iter()
            .find(|f| f.id == cur)
            .and_then(|f| f.parent_id.clone());
    }
    false
}

#[tauri::command]
fn move_folder(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    id: String,
    parent_id: Option<String>,
) -> Result<(), String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let mut folders = read_folders(&app_handle, &key);

    if let Some(ref target) = parent_id {
        if is_descendant_or_self(&folders, target, &id) {
            return Err(
                "No puedes mover una carpeta dentro de sí misma o de una de sus propias subcarpetas."
                    .into(),
            );
        }
    }

    let mut found = false;
    for folder in folders.iter_mut() {
        if folder.id == id {
            folder.parent_id = parent_id.clone();
            found = true;
            break;
        }
    }
    if !found {
        return Err("No se encontró la carpeta".into());
    }

    write_folders(&app_handle, &key, &folders);
    Ok(())
}

#[tauri::command]
fn move_entry_to_folder(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    id: String,
    folder_id: Option<String>,
) -> Result<(), String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    // Nombre de la carpeta de destino para el historial (None = raíz de la bóveda)
    let folder_name: Option<String> = folder_id.as_ref().and_then(|fid| {
        read_folders(&app_handle, &key)
            .into_iter()
            .find(|f| &f.id == fid)
            .map(|f| f.name)
    });

    let path = vault_path(&app_handle);
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: VaultFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let mut entries = decrypt_entries(&key, &file.nonce, &file.ciphertext)?;

    let mut found = false;
    for entry in entries.iter_mut() {
        if entry.id == id {
            entry.folder_id = folder_id.clone();
            entry
                .history
                .push(history_event("moved", None, folder_name.as_deref()));
            entry.updated_at = now_millis();
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

// ---------- Etiquetas y categorías (reutilizables entre registros) ----------

#[derive(Serialize, Deserialize, Clone)]
struct TaxonomyItem {
    id: String,
    name: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct Taxonomy {
    #[serde(default)]
    tags: Vec<TaxonomyItem>,
    #[serde(default)]
    categories: Vec<TaxonomyItem>,
}

#[derive(Serialize, Deserialize)]
struct TaxonomyFile {
    nonce: String,
    ciphertext: String,
}

fn taxonomy_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let dir = app_handle
        .path()
        .app_data_dir()
        .expect("no se pudo obtener la carpeta de datos de la app");
    fs::create_dir_all(&dir).ok();
    dir.join("taxonomy.json")
}

fn read_taxonomy(app_handle: &tauri::AppHandle, key: &[u8; 32]) -> Taxonomy {
    let path = taxonomy_path(app_handle);
    if !path.exists() {
        return Taxonomy::default();
    }
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Taxonomy::default(),
    };
    let file: TaxonomyFile = match serde_json::from_str(&content) {
        Ok(f) => f,
        Err(_) => return Taxonomy::default(),
    };
    let cipher = match Aes256Gcm::new_from_slice(key) {
        Ok(c) => c,
        Err(_) => return Taxonomy::default(),
    };
    let nonce_bytes = match B64.decode(&file.nonce) {
        Ok(n) => n,
        Err(_) => return Taxonomy::default(),
    };
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = match B64.decode(&file.ciphertext) {
        Ok(c) => c,
        Err(_) => return Taxonomy::default(),
    };
    match cipher.decrypt(nonce, ciphertext.as_ref()) {
        Ok(plaintext) => serde_json::from_slice(&plaintext).unwrap_or_default(),
        Err(_) => Taxonomy::default(),
    }
}

fn write_taxonomy(
    app_handle: &tauri::AppHandle,
    key: &[u8; 32],
    taxonomy: &Taxonomy,
) -> Result<(), String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    AeadOsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = serde_json::to_vec(taxonomy).map_err(|e| e.to_string())?;
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_ref())
        .map_err(|e| e.to_string())?;
    let file = TaxonomyFile {
        nonce: B64.encode(nonce_bytes),
        ciphertext: B64.encode(ciphertext),
    };
    let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    fs::write(taxonomy_path(app_handle), json).map_err(|e| e.to_string())
}

fn taxonomy_items<'a>(
    taxonomy: &'a mut Taxonomy,
    kind: &str,
) -> Result<&'a mut Vec<TaxonomyItem>, String> {
    match kind {
        "tag" => Ok(&mut taxonomy.tags),
        "category" => Ok(&mut taxonomy.categories),
        _ => Err("Tipo de elemento no válido".into()),
    }
}

fn clean_taxonomy_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("El nombre no puede estar vacío".into());
    }
    if trimmed.chars().count() > 40 {
        return Err("El nombre es demasiado largo (máximo 40 caracteres)".into());
    }
    Ok(trimmed.to_string())
}

// Quita de un registro las etiquetas y la categoría que ya no existan (y las repetidas)
fn clean_taxonomy_refs(
    app_handle: &tauri::AppHandle,
    key: &[u8; 32],
    tag_ids: Vec<String>,
    category_id: Option<String>,
) -> (Vec<String>, Option<String>) {
    let taxonomy = read_taxonomy(app_handle, key);
    let mut clean: Vec<String> = Vec::new();
    for t in tag_ids {
        if taxonomy.tags.iter().any(|x| x.id == t) && !clean.contains(&t) {
            clean.push(t);
        }
    }
    let category = category_id.filter(|c| taxonomy.categories.iter().any(|x| &x.id == c));
    (clean, category)
}

// ---------- Plantillas propias del usuario ----------
// Se guardan cifradas en templates.json. Los registros guardan sus propios campos,
// así que borrar o cambiar una plantilla nunca rompe registros ya creados.

#[derive(Serialize, Deserialize, Clone)]
struct UserTemplateField {
    label: String,
    field_type: String,
    #[serde(default)]
    sensitive: bool,
    #[serde(default)]
    config: Option<serde_json::Value>,
    #[serde(default)]
    options: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct UserTemplate {
    #[serde(default)]
    id: String,
    name: String,
    #[serde(default)]
    icon: String,
    #[serde(default)]
    name_label: String,
    #[serde(default)]
    show_username: bool,
    #[serde(default)]
    show_password: bool,
    #[serde(default)]
    show_website: bool,
    #[serde(default)]
    show_totp: bool,
    #[serde(default)]
    fields: Vec<UserTemplateField>,
}

#[derive(Serialize, Deserialize)]
struct TemplatesFile {
    nonce: String,
    ciphertext: String,
}

fn templates_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let dir = app_handle
        .path()
        .app_data_dir()
        .expect("no se pudo obtener la carpeta de datos de la app");
    fs::create_dir_all(&dir).ok();
    dir.join("templates.json")
}

fn read_templates(app_handle: &tauri::AppHandle, key: &[u8; 32]) -> Vec<UserTemplate> {
    let path = templates_path(app_handle);
    if !path.exists() {
        return Vec::new();
    }
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    let file: TemplatesFile = match serde_json::from_str(&content) {
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

fn write_templates(
    app_handle: &tauri::AppHandle,
    key: &[u8; 32],
    templates: &[UserTemplate],
) -> Result<(), String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    AeadOsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = serde_json::to_vec(templates).map_err(|e| e.to_string())?;
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_ref())
        .map_err(|e| e.to_string())?;
    let file = TemplatesFile {
        nonce: B64.encode(nonce_bytes),
        ciphertext: B64.encode(ciphertext),
    };
    let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    fs::write(templates_path(app_handle), json).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_templates(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
) -> Result<Vec<UserTemplate>, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;
    Ok(read_templates(&app_handle, &key))
}

// Crea (id vacío) o actualiza (id existente) una plantilla. Devuelve la plantilla guardada.
#[tauri::command]
fn save_template(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    template: UserTemplate,
) -> Result<UserTemplate, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let mut template = template;
    template.name = template.name.trim().to_string();
    if template.name.is_empty() {
        return Err("El nombre de la plantilla no puede estar vacío".into());
    }
    if template.name.chars().count() > 60 {
        return Err("El nombre de la plantilla es demasiado largo".into());
    }
    template.name_label = template.name_label.trim().to_string();
    if template.fields.len() > 40 {
        return Err("Demasiados campos en la plantilla".into());
    }
    for f in template.fields.iter_mut() {
        f.label = f.label.trim().to_string();
        f.options = f
            .options
            .iter()
            .map(|o| o.trim().to_string())
            .filter(|o| !o.is_empty())
            .collect();
    }
    template.fields.retain(|f| !f.label.is_empty());

    let mut templates = read_templates(&app_handle, &key);
    if templates
        .iter()
        .any(|t| t.id != template.id && t.name.to_lowercase() == template.name.to_lowercase())
    {
        return Err("Ya existe una plantilla con ese nombre".into());
    }

    if template.id.is_empty() {
        let mut n = now_millis();
        while templates.iter().any(|t| t.id == format!("u{}", n)) {
            n += 1;
        }
        template.id = format!("u{}", n);
        templates.push(template.clone());
    } else {
        match templates.iter_mut().find(|t| t.id == template.id) {
            Some(existing) => *existing = template.clone(),
            None => return Err("No se encontró la plantilla".into()),
        }
    }
    write_templates(&app_handle, &key, &templates)?;
    Ok(template)
}

#[tauri::command]
fn delete_template(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    id: String,
) -> Result<(), String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let mut templates = read_templates(&app_handle, &key);
    let before = templates.len();
    templates.retain(|t| t.id != id);
    if templates.len() == before {
        return Err("No se encontró la plantilla".into());
    }
    write_templates(&app_handle, &key, &templates)
}

// ---------- TOTP sueltos (no ligados a ningún registro) ----------
// Se guardan cifrados en totp_accounts.json. Los TOTP de los registros no se copian aquí:
// la ventana TOTP los lee directamente de cada registro.


#[derive(Serialize, Deserialize, Clone)]
struct TotpAccount {
    #[serde(default)]
    id: String,
    name: String,
    #[serde(default)]
    account: String,
    secret: String,
    #[serde(default)]
    created_at: u64,
}

#[derive(Serialize, Deserialize)]
struct TotpAccountsFile {
    nonce: String,
    ciphertext: String,
}

fn totp_accounts_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let dir = app_handle
        .path()
        .app_data_dir()
        .expect("no se pudo obtener la carpeta de datos de la app");
    fs::create_dir_all(&dir).ok();
    dir.join("totp_accounts.json")
}

fn read_totp_accounts(app_handle: &tauri::AppHandle, key: &[u8; 32]) -> Vec<TotpAccount> {
    let path = totp_accounts_path(app_handle);
    if !path.exists() {
        return Vec::new();
    }
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    let file: TotpAccountsFile = match serde_json::from_str(&content) {
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

fn write_totp_accounts(
    app_handle: &tauri::AppHandle,
    key: &[u8; 32],
    accounts: &[TotpAccount],
) -> Result<(), String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    AeadOsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = serde_json::to_vec(accounts).map_err(|e| e.to_string())?;
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_ref())
        .map_err(|e| e.to_string())?;
    let file = TotpAccountsFile {
        nonce: B64.encode(nonce_bytes),
        ciphertext: B64.encode(ciphertext),
    };
    let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    fs::write(totp_accounts_path(app_handle), json).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_totp_accounts(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
) -> Result<Vec<TotpAccount>, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;
    Ok(read_totp_accounts(&app_handle, &key))
}

// Crea (id vacío) o actualiza (id existente) un TOTP suelto. Devuelve el guardado.
#[tauri::command]
fn save_totp_account(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    account: TotpAccount,
) -> Result<TotpAccount, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let mut account = account;
    account.name = account.name.trim().to_string();
    account.account = account.account.trim().to_string();
    account.secret = account.secret.trim().to_string();
    if account.name.is_empty() {
        return Err("El nombre no puede estar vacío".into());
    }
    if account.name.chars().count() > 60 || account.account.chars().count() > 100 {
        return Err("El nombre o la cuenta son demasiado largos".into());
    }
    // Comprueba que el secreto (o la URL otpauth) es válido antes de guardarlo.
    build_totp(&account.secret, &account.name)?;

    let mut accounts = read_totp_accounts(&app_handle, &key);
    if account.id.is_empty() {
        if accounts.len() >= MAX_TOTP_ACCOUNTS {
            return Err("Has alcanzado el máximo de códigos guardados".into());
        }
        let mut n = now_millis();
        while accounts.iter().any(|a| a.id == format!("t{}", n)) {
            n += 1;
        }
        account.id = format!("t{}", n);
        account.created_at = n;
        accounts.push(account.clone());
    } else {
        match accounts.iter_mut().find(|a| a.id == account.id) {
            Some(existing) => {
                account.created_at = existing.created_at;
                *existing = account.clone();
            }
            None => return Err("No se encontró el código".into()),
        }
    }
    write_totp_accounts(&app_handle, &key, &accounts)?;
    Ok(account)
}

#[tauri::command]
fn delete_totp_account(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    id: String,
) -> Result<(), String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let mut accounts = read_totp_accounts(&app_handle, &key);
    let before = accounts.len();
    accounts.retain(|a| a.id != id);
    if accounts.len() == before {
        return Err("No se encontró el código".into());
    }
    write_totp_accounts(&app_handle, &key, &accounts)
}

// ---------- Notas seguras ----------
// Se guardan cifradas en notes.json. El contenido es texto en markdown tal como lo escribe
// el usuario; la app lo muestra con formato al verlo y en crudo al editarlo.

const MAX_NOTE_TITLE_CHARS: usize = 120;
const MAX_NOTE_CONTENT_CHARS: usize = 100_000;

#[derive(Serialize, Deserialize, Clone)]
struct Note {
    #[serde(default)]
    id: String,
    title: String,
    #[serde(default)]
    content: String,
    #[serde(default)]
    favorite: bool,
    // Nota protegida: el contenido no sale del backend sin la contraseña maestra.
    #[serde(default)]
    protected: bool,
    #[serde(default)]
    created_at: u64,
    #[serde(default)]
    updated_at: u64,
}

// Versión que se envía a la interfaz: las notas protegidas van sin contenido.
fn note_for_ui(note: &Note) -> Note {
    let mut n = note.clone();
    if n.protected {
        n.content = String::new();
    }
    n
}

#[derive(Serialize, Deserialize)]
struct NotesFile {
    nonce: String,
    ciphertext: String,
}

fn notes_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let dir = app_handle
        .path()
        .app_data_dir()
        .expect("no se pudo obtener la carpeta de datos de la app");
    fs::create_dir_all(&dir).ok();
    dir.join("notes.json")
}

fn read_notes(app_handle: &tauri::AppHandle, key: &[u8; 32]) -> Vec<Note> {
    let path = notes_path(app_handle);
    if !path.exists() {
        return Vec::new();
    }
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    let file: NotesFile = match serde_json::from_str(&content) {
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

fn write_notes(app_handle: &tauri::AppHandle, key: &[u8; 32], notes: &[Note]) -> Result<(), String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    AeadOsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = serde_json::to_vec(notes).map_err(|e| e.to_string())?;
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_ref())
        .map_err(|e| e.to_string())?;
    let file = NotesFile {
        nonce: B64.encode(nonce_bytes),
        ciphertext: B64.encode(ciphertext),
    };
    let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    fs::write(notes_path(app_handle), json).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_notes(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
) -> Result<Vec<Note>, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;
    Ok(read_notes(&app_handle, &key).iter().map(note_for_ui).collect())
}

// Crea (id vacío) o actualiza (id existente) una nota. Devuelve la nota guardada.
#[tauri::command]
fn save_note(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    note: Note,
) -> Result<Note, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let mut note = note;
    note.title = note.title.trim().to_string();
    if note.title.is_empty() {
        return Err("El título no puede estar vacío".into());
    }
    if note.title.chars().count() > MAX_NOTE_TITLE_CHARS {
        return Err("El título es demasiado largo".into());
    }
    if note.content.chars().count() > MAX_NOTE_CONTENT_CHARS {
        return Err("La nota es demasiado larga".into());
    }

    let mut notes = read_notes(&app_handle, &key);
    let now = now_millis();
    if note.id.is_empty() {
        if notes.len() >= MAX_NOTES {
            return Err("Has alcanzado el máximo de notas".into());
        }
        let mut n = now;
        while notes.iter().any(|x| x.id == format!("n{}", n)) {
            n += 1;
        }
        note.id = format!("n{}", n);
        note.created_at = now;
        note.updated_at = now;
        notes.push(note.clone());
    } else {
        match notes.iter_mut().find(|x| x.id == note.id) {
            Some(existing) => {
                note.created_at = existing.created_at;
                note.updated_at = now;
                // La protección solo se cambia con set_note_protected, nunca desde aquí.
                note.protected = existing.protected;
                *existing = note.clone();
            }
            None => return Err("No se encontró la nota".into()),
        }
    }
    write_notes(&app_handle, &key, &notes)?;
    Ok(note_for_ui(&note))
}

// Marca o desmarca una nota como favorita sin tocar su contenido (sirve también para las protegidas).
#[tauri::command]
fn set_note_favorite(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    id: String,
    favorite: bool,
) -> Result<Note, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;
    let mut notes = read_notes(&app_handle, &key);
    let result = match notes.iter_mut().find(|n| n.id == id) {
        Some(n) => {
            n.favorite = favorite;
            note_for_ui(n)
        }
        None => return Err("No se encontró la nota".into()),
    };
    write_notes(&app_handle, &key, &notes)?;
    Ok(result)
}

// Devuelve el contenido de una nota protegida si la contraseña maestra es correcta.
#[tauri::command]
fn reveal_note(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    id: String,
    master_password: String,
) -> Result<String, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;
    require_master_password(&app_handle, &master_password)?;
    read_notes(&app_handle, &key)
        .into_iter()
        .find(|n| n.id == id)
        .map(|n| n.content)
        .ok_or_else(|| "No se encontró la nota".to_string())
}

// Activa la protección (sin contraseña) o la quita (con contraseña maestra). Devuelve la nota:
// con contenido si ya no está protegida, sin él si lo sigue estando.
#[tauri::command]
fn set_note_protected(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    id: String,
    protected: bool,
    master_password: Option<String>,
) -> Result<Note, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;
    if !protected {
        require_master_password(&app_handle, master_password.as_deref().unwrap_or(""))?;
    }
    let mut notes = read_notes(&app_handle, &key);
    let result = match notes.iter_mut().find(|n| n.id == id) {
        Some(n) => {
            n.protected = protected;
            note_for_ui(n)
        }
        None => return Err("No se encontró la nota".into()),
    };
    write_notes(&app_handle, &key, &notes)?;
    Ok(result)
}

#[tauri::command]
fn delete_note(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    id: String,
) -> Result<(), String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let mut notes = read_notes(&app_handle, &key);
    let before = notes.len();
    notes.retain(|n| n.id != id);
    if notes.len() == before {
        return Err("No se encontró la nota".into());
    }
    write_notes(&app_handle, &key, &notes)
}

// ---------- Centro de notificaciones ----------
// Se guardan cifradas en notifications.json. Cada aviso guarda solo su tipo y datos mínimos
// (números, versiones), nunca texto ya traducido ni datos sensibles. `seen_keys` recuerda los
// avisos que ya se generaron para no repetirlos, aunque el usuario los borre.

const MAX_NOTIFICATIONS: usize = 200;
const MAX_SEEN_KEYS: usize = 500;
const NOTIFICATION_SEVERITIES: [&str; 4] = ["info", "warning", "security", "success"];
const MAX_NOTIFICATION_ACTIONS: usize = 3;
// Los avisos leídos se borran solos pasado este tiempo.
const READ_NOTIFICATION_TTL_MS: u64 = 30 * 24 * 60 * 60 * 1000;

// Botón opcional de un aviso. `id` elige el texto del botón y `target` adónde lleva (una vista de la app).
// Nunca se guarda texto traducido.
#[derive(Serialize, Deserialize, Clone)]
struct NotificationAction {
    id: String,
    #[serde(default)]
    target: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct AppNotification {
    #[serde(default)]
    id: String,
    kind: String,
    // "info" | "warning" | "security" | "success". Si falta (avisos antiguos), la interfaz usa el valor del tipo.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    severity: Option<String>,
    // false = no se puede descartar mientras no esté leído.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    dismissible: Option<bool>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    actions: Vec<NotificationAction>,
    #[serde(default)]
    data: serde_json::Value,
    #[serde(default)]
    read: bool,
    #[serde(default)]
    created_at: u64,
}

#[derive(Serialize, Deserialize, Default)]
struct NotificationsData {
    #[serde(default)]
    items: Vec<AppNotification>,
    #[serde(default)]
    seen_keys: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct NotificationsFile {
    nonce: String,
    ciphertext: String,
}

fn notifications_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let dir = app_handle
        .path()
        .app_data_dir()
        .expect("no se pudo obtener la carpeta de datos de la app");
    fs::create_dir_all(&dir).ok();
    dir.join("notifications.json")
}

fn read_notifications_data(app_handle: &tauri::AppHandle, key: &[u8; 32]) -> NotificationsData {
    let path = notifications_path(app_handle);
    if !path.exists() {
        return NotificationsData::default();
    }
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return NotificationsData::default(),
    };
    let file: NotificationsFile = match serde_json::from_str(&content) {
        Ok(f) => f,
        Err(_) => return NotificationsData::default(),
    };
    let cipher = match Aes256Gcm::new_from_slice(key) {
        Ok(c) => c,
        Err(_) => return NotificationsData::default(),
    };
    let nonce_bytes = match B64.decode(&file.nonce) {
        Ok(n) => n,
        Err(_) => return NotificationsData::default(),
    };
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = match B64.decode(&file.ciphertext) {
        Ok(c) => c,
        Err(_) => return NotificationsData::default(),
    };
    match cipher.decrypt(nonce, ciphertext.as_ref()) {
        Ok(plaintext) => serde_json::from_slice(&plaintext).unwrap_or_default(),
        Err(_) => NotificationsData::default(),
    }
}

fn write_notifications_data(
    app_handle: &tauri::AppHandle,
    key: &[u8; 32],
    data: &NotificationsData,
) -> Result<(), String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    AeadOsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = serde_json::to_vec(data).map_err(|e| e.to_string())?;
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_ref())
        .map_err(|e| e.to_string())?;
    let file = NotificationsFile {
        nonce: B64.encode(nonce_bytes),
        ciphertext: B64.encode(ciphertext),
    };
    let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    fs::write(notifications_path(app_handle), json).map_err(|e| e.to_string())
}

// Lee, aplica el cambio, guarda y devuelve la lista de avisos más reciente primero.
fn update_notifications<F>(
    app_handle: &tauri::AppHandle,
    state: &tauri::State<VaultState>,
    change: F,
) -> Result<Vec<AppNotification>, String>
where
    F: FnOnce(&mut NotificationsData) -> Result<(), String>,
{
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;
    let mut data = read_notifications_data(app_handle, &key);
    change(&mut data)?;

    // Los avisos leídos caducan solos.
    let now = now_millis();
    data.items
        .retain(|n| !(n.read && now.saturating_sub(n.created_at) > READ_NOTIFICATION_TTL_MS));

    // Límite: se descartan primero los leídos más antiguos y, si hace falta, los más antiguos.
    while data.items.len() > MAX_NOTIFICATIONS {
        let idx = data
            .items
            .iter()
            .enumerate()
            .filter(|(_, n)| n.read)
            .min_by_key(|(_, n)| n.created_at)
            .map(|(i, _)| i)
            .or_else(|| {
                data.items
                    .iter()
                    .enumerate()
                    .min_by_key(|(_, n)| n.created_at)
                    .map(|(i, _)| i)
            });
        match idx {
            Some(i) => {
                data.items.remove(i);
            }
            None => break,
        }
    }
    if data.seen_keys.len() > MAX_SEEN_KEYS {
        let extra = data.seen_keys.len() - MAX_SEEN_KEYS;
        data.seen_keys.drain(0..extra);
    }

    write_notifications_data(app_handle, &key, &data)?;
    let mut items = data.items;
    items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(items)
}

#[tauri::command]
fn load_notifications(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
) -> Result<Vec<AppNotification>, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;
    let mut items = read_notifications_data(&app_handle, &key).items;
    items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(items)
}

// Crea un aviso si su `key` no se había usado nunca. Devuelve la lista actualizada.
#[tauri::command]
fn add_notification(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    kind: String,
    key: String,
    data: serde_json::Value,
    severity: Option<String>,
    dismissible: Option<bool>,
    actions: Option<Vec<NotificationAction>>,
) -> Result<Vec<AppNotification>, String> {
    // El tipo decide qué texto se muestra, así que solo admite letras, números y guion bajo.
    if kind.is_empty()
        || kind.len() > 40
        || !kind
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
    {
        return Err("Tipo de aviso no válido".into());
    }
    if let Some(s) = &severity {
        if !NOTIFICATION_SEVERITIES.contains(&s.as_str()) {
            return Err("Gravedad de aviso no válida".into());
        }
    }
    let actions = actions.unwrap_or_default();
    if actions.len() > MAX_NOTIFICATION_ACTIONS {
        return Err("Demasiadas acciones en el aviso".into());
    }
    for a in &actions {
        let id_ok = !a.id.is_empty()
            && a.id.len() <= 40
            && a.id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
        let target_ok = a.target.as_ref().map_or(true, |t| t.len() <= 40);
        if !id_ok || !target_ok {
            return Err("Acción de aviso no válida".into());
        }
    }
    let key = key.trim().to_string();
    if key.is_empty() || key.chars().count() > 100 {
        return Err("Clave de aviso no válida".into());
    }
    update_notifications(&app_handle, &state, |d| {
        if d.seen_keys.contains(&key) {
            return Ok(());
        }
        let now = now_millis();
        let mut n = now;
        while d.items.iter().any(|x| x.id == format!("x{}", n)) {
            n += 1;
        }
        d.seen_keys.push(key);
        d.items.push(AppNotification {
            id: format!("x{}", n),
            kind,
            severity,
            dismissible,
            actions,
            data,
            read: false,
            created_at: now,
        });
        Ok(())
    })
}

#[tauri::command]
fn mark_notification_read(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    id: String,
    read: bool,
) -> Result<Vec<AppNotification>, String> {
    update_notifications(&app_handle, &state, |d| {
        match d.items.iter_mut().find(|n| n.id == id) {
            Some(n) => {
                n.read = read;
                Ok(())
            }
            None => Err("No se encontró el aviso".into()),
        }
    })
}

#[tauri::command]
fn mark_all_notifications_read(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
) -> Result<Vec<AppNotification>, String> {
    update_notifications(&app_handle, &state, |d| {
        for n in d.items.iter_mut() {
            n.read = true;
        }
        Ok(())
    })
}

#[tauri::command]
fn delete_notification(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    id: String,
) -> Result<Vec<AppNotification>, String> {
    update_notifications(&app_handle, &state, |d| {
        // Un aviso no descartable solo se puede borrar una vez leído.
        if d.items
            .iter()
            .any(|n| n.id == id && n.dismissible == Some(false) && !n.read)
        {
            return Err("Este aviso no se puede descartar hasta que lo marques como leído".into());
        }
        d.items.retain(|n| n.id != id);
        Ok(())
    })
}

#[tauri::command]
fn clear_notifications(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
) -> Result<Vec<AppNotification>, String> {
    update_notifications(&app_handle, &state, |d| {
        // Los avisos no descartables siguen ahí hasta que se lean.
        d.items.retain(|n| n.dismissible == Some(false) && !n.read);
        Ok(())
    })
}

#[tauri::command]
fn load_taxonomy(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
) -> Result<Taxonomy, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;
    Ok(read_taxonomy(&app_handle, &key))
}

// kind: "tag" | "category"
#[tauri::command]
fn create_taxonomy_item(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    kind: String,
    name: String,
) -> Result<TaxonomyItem, String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let name = clean_taxonomy_name(&name)?;
    let mut taxonomy = read_taxonomy(&app_handle, &key);
    let items = taxonomy_items(&mut taxonomy, &kind)?;
    if items
        .iter()
        .any(|i| i.name.to_lowercase() == name.to_lowercase())
    {
        return Err("Ya existe un elemento con ese nombre".into());
    }

    let mut n = now_millis();
    while items.iter().any(|i| i.id == n.to_string()) {
        n += 1;
    }
    let item = TaxonomyItem {
        id: n.to_string(),
        name,
    };
    items.push(item.clone());
    write_taxonomy(&app_handle, &key, &taxonomy)?;
    Ok(item)
}

#[tauri::command]
fn rename_taxonomy_item(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    kind: String,
    id: String,
    name: String,
) -> Result<(), String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let name = clean_taxonomy_name(&name)?;
    let mut taxonomy = read_taxonomy(&app_handle, &key);
    let items = taxonomy_items(&mut taxonomy, &kind)?;
    if items
        .iter()
        .any(|i| i.id != id && i.name.to_lowercase() == name.to_lowercase())
    {
        return Err("Ya existe un elemento con ese nombre".into());
    }
    match items.iter_mut().find(|i| i.id == id) {
        Some(item) => item.name = name,
        None => return Err("No se encontró el elemento".into()),
    }
    write_taxonomy(&app_handle, &key, &taxonomy)
}

// Al eliminar una etiqueta o categoría se quita también de los registros que la usaban
#[tauri::command]
fn delete_taxonomy_item(
    app_handle: tauri::AppHandle,
    state: tauri::State<VaultState>,
    kind: String,
    id: String,
) -> Result<(), String> {
    let key_opt: Option<[u8; 32]> = *state.key.lock().unwrap();
    let key = key_opt.ok_or("El vault está bloqueado")?;

    let mut taxonomy = read_taxonomy(&app_handle, &key);
    {
        let items = taxonomy_items(&mut taxonomy, &kind)?;
        let before = items.len();
        items.retain(|i| i.id != id);
        if items.len() == before {
            return Err("No se encontró el elemento".into());
        }
    }
    write_taxonomy(&app_handle, &key, &taxonomy)?;

    let path = vault_path(&app_handle);
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: VaultFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let mut entries = decrypt_entries(&key, &file.nonce, &file.ciphertext)?;

    let mut changed = false;
    for entry in entries.iter_mut() {
        if kind == "tag" {
            let before = entry.tag_ids.len();
            entry.tag_ids.retain(|t| t != &id);
            if entry.tag_ids.len() != before {
                changed = true;
            }
        } else if entry.category_id.as_deref() == Some(id.as_str()) {
            entry.category_id = None;
            changed = true;
        }
    }

    if changed {
        let (nonce, ciphertext) = encrypt_entries(&key, &entries);
        let new_file = VaultFile {
            salt: file.salt,
            nonce,
            ciphertext,
        };
        let json = serde_json::to_string_pretty(&new_file).map_err(|e| e.to_string())?;
        fs::write(&path, json).map_err(|e| e.to_string())?;
    }
    Ok(())
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
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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
            change_master_password,
            window_minimize,
            window_toggle_fullscreen,
            window_set_always_on_top,
            window_set_zoom,
            quit_app,
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
            export_backup,
            import_backup,
            get_backup_config,
            set_backup_config,
            pick_backup_folder,
            run_backup_now,
            import_vault,
            totp_backup_codes_remaining,
            totp_generate_backup_codes,
            totp_verify_backup_code,
            load_folders,
            create_folder,
            rename_folder,
            delete_folder,
            move_entry_to_folder,
            move_folder,
            load_taxonomy,
            create_taxonomy_item,
            rename_taxonomy_item,
            delete_taxonomy_item,
            load_templates,
            save_template,
            delete_template,
            load_totp_accounts,
            save_totp_account,
            delete_totp_account,
            load_notes,
            save_note,
            delete_note,
            set_note_favorite,
            reveal_note,
            set_note_protected,
            load_notifications,
            add_notification,
            mark_notification_read,
            mark_all_notifications_read,
            delete_notification,
            clear_notifications,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}