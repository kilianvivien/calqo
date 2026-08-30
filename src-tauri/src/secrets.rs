//! Keychain entries are scoped to Calqo. No caller-selected service or file path.
const SERVICE: &str = "dev.calqo.desktop.ai";

fn validate_key(key: &str) -> Result<(), String> {
    if !key.starts_with("secure:") || key.len() > 128 || !key.is_ascii() {
        return Err("Invalid secret key".into());
    }
    Ok(())
}

#[tauri::command]
pub fn read_secret(key: String) -> Result<Option<String>, String> {
    validate_key(&key)?;
    #[cfg(target_os = "macos")]
    {
        use security_framework::passwords::{generic_password, PasswordOptions};
        match generic_password(PasswordOptions::new_generic_password(SERVICE, &key)) {
            Ok(bytes) => String::from_utf8(bytes)
                .map(Some)
                .map_err(|_| "Invalid saved secret".into()),
            Err(error) if error.code() == -25300 => Ok(None), // errSecItemNotFound
            Err(_) => Err("Keychain is unavailable".into()),
        }
    }
    #[cfg(not(target_os = "macos"))]
    Err("Secure storage is unavailable on this platform".into())
}

#[tauri::command]
pub fn write_secret(key: String, value: String) -> Result<(), String> {
    validate_key(&key)?;
    if value.len() > 65_536 {
        return Err("Secret exceeds storage limit".into());
    }
    #[cfg(target_os = "macos")]
    {
        security_framework::passwords::set_generic_password(SERVICE, &key, value.as_bytes())
            .map_err(|_| "Keychain is unavailable".into())
    }
    #[cfg(not(target_os = "macos"))]
    Err("Secure storage is unavailable on this platform".into())
}

#[tauri::command]
pub fn remove_secret(key: String) -> Result<(), String> {
    validate_key(&key)?;
    #[cfg(target_os = "macos")]
    {
        match security_framework::passwords::delete_generic_password(SERVICE, &key) {
            Ok(()) => Ok(()),
            Err(error) if error.code() == -25300 => Ok(()),
            Err(_) => Err("Keychain is unavailable".into()),
        }
    }
    #[cfg(not(target_os = "macos"))]
    Err("Secure storage is unavailable on this platform".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn limits_secret_namespace_without_touching_the_keychain() {
        assert!(validate_key("secure:ai.keys").is_ok());
        assert!(validate_key("other-app").is_err());
        assert!(validate_key(&format!("secure:{}", "x".repeat(128))).is_err());
    }
}
