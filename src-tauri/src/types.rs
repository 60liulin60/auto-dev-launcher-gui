use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevConfig {
  pub command: String,
  pub cwd: String,
  #[serde(default)]
  pub env: Option<HashMap<String, String>>,
  #[serde(default)]
  pub port: Option<u16>,
  #[serde(default)]
  pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectHistoryEntry {
  pub id: String,
  pub name: String,
  pub path: String,
  pub last_launched: u64,
  pub config: DevConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowBounds {
  pub width: u32,
  pub height: u32,
  #[serde(default)]
  pub x: Option<i32>,
  #[serde(default)]
  pub y: Option<i32>,
}

impl Default for WindowBounds {
  fn default() -> Self {
    Self {
      width: 1200,
      height: 800,
      x: None,
      y: None,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
  pub window_bounds: WindowBounds,
  pub theme: String,
  pub max_history_entries: u32,
}

impl Default for AppSettings {
  fn default() -> Self {
    Self {
      window_bounds: WindowBounds::default(),
      theme: "system".to_string(),
      max_history_entries: 50,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationError {
  pub field: String,
  pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
  pub valid: bool,
  pub errors: Vec<ValidationError>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ServerStatus {
  Idle,
  Starting,
  Running,
  Stopped,
  Error,
}

impl Default for ServerStatus {
  fn default() -> Self {
    Self::Idle
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerProcess {
  pub project_id: String,
  pub pid: u32,
  pub status: ServerStatus,
  pub start_time: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputPayload {
  pub project_id: String,
  pub output: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusChangePayload {
  pub project_id: String,
  pub status: ServerStatus,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlDetectedPayload {
  pub project_id: String,
  pub url: String,
}
