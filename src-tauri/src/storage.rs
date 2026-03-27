use crate::types::{AppSettings, ProjectHistoryEntry, WindowBounds};
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::{
  env,
  fs,
  path::{Path, PathBuf},
};

const APP_NAME: &str = "auto-dev-launcher-gui";
const HISTORY_FILE: &str = "project-history.json";
const SETTINGS_FILE: &str = "app-settings.json";

#[derive(Clone)]
pub struct StorageManager {
  storage_path: PathBuf,
}

impl StorageManager {
  pub fn new() -> Result<Self, String> {
    let storage_path = get_storage_path();
    fs::create_dir_all(&storage_path).map_err(|error| format!("鏃犳硶鍒涘缓瀛樺偍鐩綍: {error}"))?;

    Ok(Self { storage_path })
  }

  pub fn load_project_history(&self) -> Result<Vec<ProjectHistoryEntry>, String> {
    Ok(self
      .read_json_with_fallback::<Vec<ProjectHistoryEntry>>(&self.history_file_path())?
      .unwrap_or_default())
  }

  pub fn save_project_history(&self, history: &[ProjectHistoryEntry]) -> Result<(), String> {
    self.atomic_write_json(&self.history_file_path(), history)
  }

  pub fn load_settings(&self) -> Result<AppSettings, String> {
    Ok(self
      .read_json_with_fallback::<AppSettings>(&self.settings_file_path())?
      .unwrap_or_default())
  }

  pub fn save_settings(&self, settings: &AppSettings) -> Result<(), String> {
    self.atomic_write_json(&self.settings_file_path(), settings)
  }

  pub fn save_window_bounds(&self, bounds: &WindowBounds) -> Result<(), String> {
    let mut settings = self.load_settings().unwrap_or_default();
    settings.window_bounds = bounds.clone();
    self.save_settings(&settings)
  }

  fn history_file_path(&self) -> PathBuf {
    self.storage_path.join(HISTORY_FILE)
  }

  fn settings_file_path(&self) -> PathBuf {
    self.storage_path.join(SETTINGS_FILE)
  }

  fn atomic_write_json<T>(&self, file_path: &Path, value: &T) -> Result<(), String>
  where
    T: Serialize + ?Sized,
  {
    let content = serde_json::to_string_pretty(value)
      .map_err(|error| format!("鏃犳硶搴忓垪鍖栧瓨鍌ㄦ暟鎹? {error}"))?;

    let tmp_path = file_path.with_extension("tmp");
    let bak_path = file_path.with_extension("bak");

    fs::write(&tmp_path, content).map_err(|error| format!("鏃犳硶鍐欏叆涓存椂鏂囦欢: {error}"))?;

    if file_path.exists() {
      let _ = fs::copy(file_path, &bak_path);
      let _ = fs::remove_file(file_path);
    }

    fs::rename(&tmp_path, file_path).map_err(|error| format!("鏃犳硶鏇挎崲瀛樺偍鏂囦欢: {error}"))?;

    Ok(())
  }

  fn read_json_with_fallback<T>(&self, file_path: &Path) -> Result<Option<T>, String>
  where
    T: DeserializeOwned + Serialize,
  {
    if file_path.exists() {
      match fs::read_to_string(file_path) {
        Ok(content) => match serde_json::from_str::<T>(&content) {
          Ok(value) => return Ok(Some(value)),
          Err(_) => {}
        },
        Err(_) => {}
      }
    }

    let bak_path = file_path.with_extension("bak");
    if !bak_path.exists() {
      return Ok(None);
    }

    let content = fs::read_to_string(&bak_path)
      .map_err(|error| format!("鏃犳硶璇诲彇澶囦唤鏂囦欢: {error}"))?;
    let value = serde_json::from_str::<T>(&content)
      .map_err(|error| format!("澶囦唤鏂囦欢鏍煎紡鏃犳晥: {error}"))?;

    self.atomic_write_json(file_path, &value)?;

    Ok(Some(value))
  }
}

fn get_storage_path() -> PathBuf {
  if cfg!(target_os = "windows") {
    let base = env::var("APPDATA").unwrap_or_else(|_| {
      let home = env::var("USERPROFILE").unwrap_or_else(|_| ".".to_string());
      format!("{home}\\AppData\\Roaming")
    });

    return PathBuf::from(base).join(APP_NAME);
  }

  if cfg!(target_os = "macos") {
    let home = env::var("HOME").unwrap_or_else(|_| ".".to_string());
    return PathBuf::from(home)
      .join("Library")
      .join("Application Support")
      .join(APP_NAME);
  }

  let home = env::var("HOME").unwrap_or_else(|_| ".".to_string());
  PathBuf::from(home).join(".config").join(APP_NAME)
}

