mod config;
mod process_manager;
mod storage;
mod types;

use config::{load_project_config, sanitize_path, validate_dev_config};
use process_manager::ProcessManager;
use storage::StorageManager;
use tauri::{Manager, WindowEvent};
use types::{AppSettings, DevConfig, ProjectHistoryEntry, ValidationResult, WindowBounds};

struct AppState {
  storage: StorageManager,
  process_manager: ProcessManager,
}

#[tauri::command]
fn load_config(project_path: String) -> Result<DevConfig, String> {
  load_project_config(&project_path)
}

#[tauri::command]
fn validate_config(config: DevConfig) -> ValidationResult {
  validate_dev_config(&config)
}

#[tauri::command]
fn start_server(
  app: tauri::AppHandle,
  state: tauri::State<AppState>,
  project_id: String,
  project_path: String,
  config: DevConfig,
) -> Result<types::ServerProcess, String> {
  state
    .process_manager
    .start_server(&app, project_id, project_path, config)
}

#[tauri::command]
fn stop_server(state: tauri::State<AppState>, project_id: String) -> Result<(), String> {
  state.process_manager.stop_server(&project_id)
}

#[tauri::command]
fn get_server_status(
  state: tauri::State<AppState>,
  project_id: String,
) -> Result<types::ServerStatus, String> {
  Ok(state.process_manager.get_server_status(&project_id))
}

#[tauri::command]
fn load_history(state: tauri::State<AppState>) -> Result<Vec<ProjectHistoryEntry>, String> {
  state.storage.load_project_history()
}

#[tauri::command]
fn add_to_history(
  state: tauri::State<AppState>,
  mut entry: ProjectHistoryEntry,
) -> Result<(), String> {
  let mut history = state.storage.load_project_history()?;
  entry.last_launched = current_timestamp_ms();

  if let Some(index) = history.iter().position(|item| item.id == entry.id) {
    history[index] = entry;
  } else {
    history.push(entry);
  }

  state.storage.save_project_history(&history)
}

#[tauri::command]
fn remove_from_history(state: tauri::State<AppState>, project_id: String) -> Result<(), String> {
  let history = state
    .storage
    .load_project_history()?
    .into_iter()
    .filter(|entry| entry.id != project_id)
    .collect::<Vec<_>>();

  state.storage.save_project_history(&history)
}

#[tauri::command]
fn clear_history(state: tauri::State<AppState>) -> Result<(), String> {
  state.storage.save_project_history(&[])
}

#[tauri::command]
fn open_in_explorer(path_or_url: String) -> Result<(), String> {
  if path_or_url.starts_with("http://") || path_or_url.starts_with("https://") {
    return open_url(&path_or_url);
  }

  let path = sanitize_path(&path_or_url)?;
  open_path(&path)
}

#[tauri::command]
fn check_path_exists(file_path: String) -> Result<bool, String> {
  Ok(sanitize_path(&file_path).map(|path| path.exists()).unwrap_or(false))
}

pub fn run() {
  let storage = StorageManager::new().expect("failed to create storage manager");
  let process_manager = ProcessManager::new();

  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(AppState {
      storage,
      process_manager,
    })
    .setup(|app| {
      if let Some(window) = app.get_webview_window("main") {
        let state = app.state::<AppState>();
        let settings = state.storage.load_settings().unwrap_or_default();
        apply_window_settings(&window, &settings);
      }

      Ok(())
    })
    .on_window_event(|window, event| match event {
      WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
        let state = window.state::<AppState>();
        let bounds = capture_window_bounds(window);

        if let Some(bounds) = bounds {
          let _ = state.storage.save_window_bounds(&bounds);
        }
      }
      WindowEvent::CloseRequested { api, .. } => {
        api.prevent_close();

        let state = window.state::<AppState>();
        let manager = state.process_manager.clone();
        let window = window.clone();

        std::thread::spawn(move || {
          if manager.stop_all_servers().is_ok() {
            let _ = window.destroy();
          }
        });
      }
      _ => {}
    })
    .invoke_handler(tauri::generate_handler![
      load_config,
      validate_config,
      start_server,
      stop_server,
      get_server_status,
      load_history,
      add_to_history,
      remove_from_history,
      clear_history,
      open_in_explorer,
      check_path_exists
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

fn apply_window_settings(window: &tauri::WebviewWindow, settings: &AppSettings) {
  let bounds = &settings.window_bounds;

  let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(
    bounds.width as f64,
    bounds.height as f64,
  )));

  if let (Some(x), Some(y)) = (bounds.x, bounds.y) {
    let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(
      x as f64,
      y as f64,
    )));
  }
}

fn capture_window_bounds(window: &tauri::Window) -> Option<WindowBounds> {
  let size = window.outer_size().ok()?;
  let position = window.outer_position().ok();

  Some(WindowBounds {
    width: size.width,
    height: size.height,
    x: position.map(|value| value.x),
    y: position.map(|value| value.y),
  })
}

fn open_url(url: &str) -> Result<(), String> {
  if cfg!(target_os = "windows") {
    std::process::Command::new("cmd")
      .args(["/C", "start", "", url])
      .spawn()
      .map_err(|error| format!("鏃犳硶鎵撳紑閾炬帴: {error}"))?;
    return Ok(());
  }

  let opener = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
  std::process::Command::new(opener)
    .arg(url)
    .spawn()
    .map_err(|error| format!("鏃犳硶鎵撳紑閾炬帴: {error}"))?;

  Ok(())
}

fn open_path(path: &std::path::Path) -> Result<(), String> {
  if cfg!(target_os = "windows") {
    std::process::Command::new("explorer")
      .arg(path)
      .spawn()
      .map_err(|error| format!("鏃犳硶鎵撳紑璺緞: {error}"))?;
    return Ok(());
  }

  let opener = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
  std::process::Command::new(opener)
    .arg(path)
    .spawn()
    .map_err(|error| format!("鏃犳硶鎵撳紑璺緞: {error}"))?;

  Ok(())
}

fn current_timestamp_ms() -> u64 {
  std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|duration| duration.as_millis() as u64)
    .unwrap_or_default()
}

