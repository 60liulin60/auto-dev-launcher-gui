use crate::config::{
  detect_package_manager,
  sanitize_command,
  sanitize_path,
  validate_dev_config_or_error,
  validate_project_directory,
};
use crate::types::{
  DevConfig,
  OutputPayload,
  ServerProcess,
  ServerStatus,
  StatusChangePayload,
  UrlDetectedPayload,
};
use regex::Regex;
use std::{
  collections::HashMap,
  io::Read,
  path::Path,
  process::{Child, Command, Stdio},
  sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
    Mutex,
  },
  thread,
  time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};

const BUFFER_FLUSH_INTERVAL_MS: u64 = 100;
const DEPENDENCY_INSTALL_TIMEOUT_MS: u64 = 5 * 60 * 1000;
const STARTUP_TIMEOUT_MS: u64 = 10 * 1000;
const STOP_ALL_TIMEOUT_MS: u64 = 10 * 1000;
const STOP_WAIT_INTERVAL_MS: u64 = 100;

const EVENT_SERVER_OUTPUT: &str = "server-output";
const EVENT_SERVER_STATUS_CHANGE: &str = "server-status-change";
const EVENT_SERVER_URL_DETECTED: &str = "server-url-detected";

const LOCAL_URL_REGEX: &str =
  r"(?:Local|local|localhost|127\.0\.0\.1)[\s:]+(?:http:\/\/)?(?:localhost|127\.0\.0\.1):(\d+)";

const ENV_PROTECTED_KEYS: &[&str] = &[
  "PATH",
  "Path",
  "path",
  "SYSTEMROOT",
  "SystemRoot",
  "SYSTEMDRIVE",
  "SystemDrive",
  "COMSPEC",
  "WINDIR",
  "NODE_OPTIONS",
  "NODE_PATH",
  "LD_LIBRARY_PATH",
  "DYLD_LIBRARY_PATH",
];

#[derive(Clone)]
struct ManagedProcess {
  pid: u32,
  child: Arc<Mutex<Child>>,
  info: Arc<Mutex<ServerProcess>>,
  output_buffer: Arc<Mutex<String>>,
  flush_scheduled: Arc<AtomicBool>,
  url_detected: Arc<AtomicBool>,
}

#[derive(Clone)]
pub struct ProcessManager {
  processes: Arc<Mutex<HashMap<String, ManagedProcess>>>,
}

impl ProcessManager {
  pub fn new() -> Self {
    Self {
      processes: Arc::new(Mutex::new(HashMap::new())),
    }
  }

  pub fn start_server(
    &self,
    app: &AppHandle,
    project_id: String,
    project_path: String,
    config: DevConfig,
  ) -> Result<ServerProcess, String> {
    let project_path = sanitize_path(&project_path)?;
    validate_project_directory(&project_path)?;
    validate_dev_config_or_error(&config)?;

    let work_dir = sanitize_path(&config.cwd)?;
    validate_project_directory(&work_dir)?;

    {
      let processes = self.processes.lock().map_err(lock_error)?;
      if let Some(existing) = processes.get(&project_id) {
        let status = existing.info.lock().map_err(lock_error)?.status;
        if matches!(status, ServerStatus::Starting | ServerStatus::Running) {
          return Err("project is already running".to_string());
        }
      }
    }

    self.install_dependencies_if_needed(app, &project_id, &project_path)?;

    let sanitized_command = sanitize_command(&config.command)?;
    let mut command = create_shell_command(&sanitized_command);
    command
      .current_dir(&work_dir)
      .stdout(Stdio::piped())
      .stderr(Stdio::piped());

    apply_safe_environment(app, &project_id, &config, &mut command);

    let mut child = command
      .spawn()
      .map_err(|error| format!("failed to start server process: {error}"))?;

    let pid = child.id();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let process_info = Arc::new(Mutex::new(ServerProcess {
      project_id: project_id.clone(),
      pid,
      status: ServerStatus::Starting,
      start_time: current_timestamp_ms(),
    }));

    let managed_process = ManagedProcess {
      pid,
      child: Arc::new(Mutex::new(child)),
      info: process_info.clone(),
      output_buffer: Arc::new(Mutex::new(String::new())),
      flush_scheduled: Arc::new(AtomicBool::new(false)),
      url_detected: Arc::new(AtomicBool::new(false)),
    };

    {
      let mut processes = self.processes.lock().map_err(lock_error)?;
      processes.insert(project_id.clone(), managed_process.clone());
    }

    if let Some(stdout) = stdout {
      Self::spawn_output_reader(
        app.clone(),
        project_id.clone(),
        stdout,
        managed_process.info.clone(),
        managed_process.output_buffer.clone(),
        managed_process.flush_scheduled.clone(),
        managed_process.url_detected.clone(),
      );
    }

    if let Some(stderr) = stderr {
      Self::spawn_output_reader(
        app.clone(),
        project_id.clone(),
        stderr,
        managed_process.info.clone(),
        managed_process.output_buffer.clone(),
        managed_process.flush_scheduled.clone(),
        managed_process.url_detected.clone(),
      );
    }

    Self::spawn_startup_guard(
      app.clone(),
      project_id.clone(),
      managed_process.child.clone(),
      managed_process.info.clone(),
      self.processes.clone(),
    );

    Self::spawn_exit_monitor(
      app.clone(),
      project_id.clone(),
      managed_process,
      self.processes.clone(),
    );

    process_info.lock().map_err(lock_error).map(|info| info.clone())
  }

  pub fn stop_server(&self, project_id: &str) -> Result<(), String> {
    let managed_process = {
      let processes = self.processes.lock().map_err(lock_error)?;
      processes.get(project_id).cloned()
    }
    .ok_or_else(|| "project is not running".to_string())?;

    if cfg!(target_os = "windows") {
      let taskkill_succeeded = Command::new("taskkill")
        .args([
          "/pid",
          &managed_process.pid.to_string(),
          "/T",
          "/F",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false);

      if !taskkill_succeeded {
        Self::kill_child_if_running(&managed_process)?;
      }
    } else {
      Self::kill_child_if_running(&managed_process)?;
    }

    Ok(())
  }

  pub fn get_server_status(&self, project_id: &str) -> ServerStatus {
    let Ok(processes) = self.processes.lock() else {
      return ServerStatus::Idle;
    };

    let Some(process) = processes.get(project_id) else {
      return ServerStatus::Idle;
    };

    process
      .info
      .lock()
      .map(|info| info.status)
      .unwrap_or(ServerStatus::Idle)
  }

  pub fn stop_all_servers(&self) -> Result<(), String> {
    let project_ids = {
      let processes = self.processes.lock().map_err(lock_error)?;
      processes.keys().cloned().collect::<Vec<_>>()
    };

    for project_id in project_ids {
      let _ = self.stop_server(&project_id);
    }

    self.wait_for_all_servers_stopped(Duration::from_millis(STOP_ALL_TIMEOUT_MS))
  }

  fn kill_child_if_running(managed_process: &ManagedProcess) -> Result<(), String> {
    let mut child = managed_process.child.lock().map_err(lock_error)?;
    let exit_status = child
      .try_wait()
      .map_err(|error| format!("failed to query server status: {error}"))?;

    if exit_status.is_some() {
      return Ok(());
    }

    child.kill().map_err(|error| format!("failed to stop server: {error}"))
  }

  fn wait_for_all_servers_stopped(&self, timeout: Duration) -> Result<(), String> {
    let deadline = Instant::now() + timeout;

    loop {
      let active_processes = self.processes.lock().map_err(lock_error)?.len();

      if active_processes == 0 {
        return Ok(());
      }

      if Instant::now() >= deadline {
        return Err(format!(
          "still waiting for {active_processes} process(es) to stop"
        ));
      }

      thread::sleep(Duration::from_millis(STOP_WAIT_INTERVAL_MS));
    }
  }

  fn install_dependencies_if_needed(
    &self,
    app: &AppHandle,
    project_id: &str,
    project_path: &Path,
  ) -> Result<(), String> {
    if !project_path.join("package.json").exists() || project_path.join("node_modules").exists() {
      return Ok(());
    }

    let package_manager = detect_package_manager(project_path);
    Self::emit_output_text(
      app,
      project_id,
      &format!(
        "\nMissing `node_modules`. Installing dependencies with `{package_manager}`...\nCommand: {package_manager} install\n\n"
      ),
    );

    let mut install_command = create_shell_command(&format!("{package_manager} install"));
    install_command
      .current_dir(project_path)
      .stdout(Stdio::piped())
      .stderr(Stdio::piped());

    let mut install_process = install_command
      .spawn()
      .map_err(|error| format!("failed to start dependency install: {error}"))?;

    let output_buffer = Arc::new(Mutex::new(String::new()));
    let flush_scheduled = Arc::new(AtomicBool::new(false));

    if let Some(stdout) = install_process.stdout.take() {
      Self::spawn_install_output_reader(
        app.clone(),
        project_id.to_string(),
        stdout,
        output_buffer.clone(),
        flush_scheduled.clone(),
      );
    }

    if let Some(stderr) = install_process.stderr.take() {
      Self::spawn_install_output_reader(
        app.clone(),
        project_id.to_string(),
        stderr,
        output_buffer.clone(),
        flush_scheduled.clone(),
      );
    }

    let started_at = Instant::now();
    loop {
      if let Some(status) = install_process
        .try_wait()
        .map_err(|error| format!("failed to read dependency install status: {error}"))?
      {
        Self::flush_output_now(app, project_id, &output_buffer);

        if status.success() {
          Self::emit_output_text(
            app,
            project_id,
            "\nDependencies installed. Starting development server...\n\n",
          );
          return Ok(());
        }

        return Err(format!(
          "dependency install exited with code {}",
          status.code().unwrap_or(-1)
        ));
      }

      if started_at.elapsed() > Duration::from_millis(DEPENDENCY_INSTALL_TIMEOUT_MS) {
        let _ = install_process.kill();
        Self::flush_output_now(app, project_id, &output_buffer);
        return Err("dependency install timed out".to_string());
      }

      thread::sleep(Duration::from_millis(200));
    }
  }

  fn spawn_output_reader<R>(
    app: AppHandle,
    project_id: String,
    mut reader: R,
    process_info: Arc<Mutex<ServerProcess>>,
    output_buffer: Arc<Mutex<String>>,
    flush_scheduled: Arc<AtomicBool>,
    url_detected: Arc<AtomicBool>,
  ) where
    R: Read + Send + 'static,
  {
    thread::spawn(move || {
      let url_regex = Regex::new(LOCAL_URL_REGEX).expect("valid url regex");
      let ansi_regex = Regex::new(r"\x1b\[[0-9;]*[A-Za-z]").expect("valid ansi regex");
      let mut bytes = [0_u8; 4096];

      loop {
        match reader.read(&mut bytes) {
          Ok(0) => break,
          Ok(count) => {
            let raw_output = String::from_utf8_lossy(&bytes[..count]).into_owned();
            let clean_output = ansi_regex.replace_all(&raw_output, "").to_string();

            Self::mark_running_if_needed(&app, &project_id, &process_info);
            Self::detect_url_if_needed(
              &app,
              &project_id,
              &clean_output,
              &url_regex,
              &url_detected,
            );
            Self::queue_output(
              app.clone(),
              project_id.clone(),
              output_buffer.clone(),
              flush_scheduled.clone(),
              clean_output,
            );
          }
          Err(error) => {
            Self::queue_output(
              app.clone(),
              project_id.clone(),
              output_buffer.clone(),
              flush_scheduled.clone(),
              format!("\noutput read error: {error}\n"),
            );
            break;
          }
        }
      }
    });
  }

  fn spawn_install_output_reader<R>(
    app: AppHandle,
    project_id: String,
    mut reader: R,
    output_buffer: Arc<Mutex<String>>,
    flush_scheduled: Arc<AtomicBool>,
  ) where
    R: Read + Send + 'static,
  {
    thread::spawn(move || {
      let ansi_regex = Regex::new(r"\x1b\[[0-9;]*[A-Za-z]").expect("valid ansi regex");
      let mut bytes = [0_u8; 4096];

      loop {
        match reader.read(&mut bytes) {
          Ok(0) => break,
          Ok(count) => {
            let raw_output = String::from_utf8_lossy(&bytes[..count]).into_owned();
            let clean_output = ansi_regex.replace_all(&raw_output, "").to_string();

            Self::queue_output(
              app.clone(),
              project_id.clone(),
              output_buffer.clone(),
              flush_scheduled.clone(),
              clean_output,
            );
          }
          Err(error) => {
            Self::queue_output(
              app.clone(),
              project_id.clone(),
              output_buffer.clone(),
              flush_scheduled.clone(),
              format!("\ndependency install output read error: {error}\n"),
            );
            break;
          }
        }
      }
    });
  }

  fn spawn_startup_guard(
    app: AppHandle,
    project_id: String,
    child: Arc<Mutex<Child>>,
    process_info: Arc<Mutex<ServerProcess>>,
    processes: Arc<Mutex<HashMap<String, ManagedProcess>>>,
  ) {
    thread::spawn(move || {
      thread::sleep(Duration::from_millis(STARTUP_TIMEOUT_MS));

      let is_still_starting = process_info
        .lock()
        .map(|info| info.status == ServerStatus::Starting)
        .unwrap_or(false);

      if !is_still_starting {
        return;
      }

      let is_running = child
        .lock()
        .ok()
        .and_then(|mut process| process.try_wait().ok())
        .flatten()
        .is_none();

      let next_status = if is_running {
        ServerStatus::Running
      } else {
        ServerStatus::Error
      };

      if let Ok(mut info) = process_info.lock() {
        if info.status == ServerStatus::Starting {
          info.status = next_status;
        }
      }

      let _ = app.emit(
        EVENT_SERVER_STATUS_CHANGE,
        StatusChangePayload {
          project_id: project_id.clone(),
          status: next_status,
        },
      );

      if next_status == ServerStatus::Error {
        let _ = processes.lock().map(|mut items| items.remove(&project_id));
      }
    });
  }

  fn spawn_exit_monitor(
    app: AppHandle,
    project_id: String,
    managed_process: ManagedProcess,
    processes: Arc<Mutex<HashMap<String, ManagedProcess>>>,
  ) {
    thread::spawn(move || {
      loop {
        let wait_result = {
          let mut child = match managed_process.child.lock() {
            Ok(child) => child,
            Err(_) => return,
          };

          child.try_wait()
        };

        match wait_result {
          Ok(Some(_)) => break,
          Ok(None) => thread::sleep(Duration::from_millis(250)),
          Err(error) => {
            Self::queue_output(
              app.clone(),
              project_id.clone(),
              managed_process.output_buffer.clone(),
              managed_process.flush_scheduled.clone(),
              format!("\nprocess exit monitor error: {error}\n"),
            );
            break;
          }
        }
      }

      Self::flush_output_now(&app, &project_id, &managed_process.output_buffer);

      if let Ok(mut info) = managed_process.info.lock() {
        info.status = ServerStatus::Stopped;
      }

      let _ = app.emit(
        EVENT_SERVER_STATUS_CHANGE,
        StatusChangePayload {
          project_id: project_id.clone(),
          status: ServerStatus::Stopped,
        },
      );

      let _ = processes.lock().map(|mut items| items.remove(&project_id));
    });
  }

  fn mark_running_if_needed(
    app: &AppHandle,
    project_id: &str,
    process_info: &Arc<Mutex<ServerProcess>>,
  ) {
    let mut should_emit = false;

    if let Ok(mut info) = process_info.lock() {
      if info.status == ServerStatus::Starting {
        info.status = ServerStatus::Running;
        should_emit = true;
      }
    }

    if should_emit {
      let _ = app.emit(
        EVENT_SERVER_STATUS_CHANGE,
        StatusChangePayload {
          project_id: project_id.to_string(),
          status: ServerStatus::Running,
        },
      );
    }
  }

  fn detect_url_if_needed(
    app: &AppHandle,
    project_id: &str,
    output: &str,
    url_regex: &Regex,
    url_detected: &AtomicBool,
  ) {
    if url_detected.load(Ordering::Acquire) {
      return;
    }

    let Some(captures) = url_regex.captures(output) else {
      return;
    };

    let Some(port) = captures.get(1) else {
      return;
    };

    if url_detected
      .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
      .is_ok()
    {
      let _ = app.emit(
        EVENT_SERVER_URL_DETECTED,
        UrlDetectedPayload {
          project_id: project_id.to_string(),
          url: format!("http://localhost:{}", port.as_str()),
        },
      );
    }
  }

  fn queue_output(
    app: AppHandle,
    project_id: String,
    output_buffer: Arc<Mutex<String>>,
    flush_scheduled: Arc<AtomicBool>,
    chunk: String,
  ) {
    if chunk.is_empty() {
      return;
    }

    if let Ok(mut buffer) = output_buffer.lock() {
      buffer.push_str(&chunk);
    }

    Self::schedule_output_flush(app, project_id, output_buffer, flush_scheduled);
  }

  fn schedule_output_flush(
    app: AppHandle,
    project_id: String,
    output_buffer: Arc<Mutex<String>>,
    flush_scheduled: Arc<AtomicBool>,
  ) {
    if flush_scheduled.swap(true, Ordering::AcqRel) {
      return;
    }

    thread::spawn(move || {
      thread::sleep(Duration::from_millis(BUFFER_FLUSH_INTERVAL_MS));

      let pending_output = {
        let mut buffer = match output_buffer.lock() {
          Ok(buffer) => buffer,
          Err(_) => return,
        };

        std::mem::take(&mut *buffer)
      };

      flush_scheduled.store(false, Ordering::Release);

      if !pending_output.is_empty() {
        let _ = app.emit(
          EVENT_SERVER_OUTPUT,
          OutputPayload {
            project_id: project_id.clone(),
            output: pending_output,
          },
        );
      }

      let has_more_output = output_buffer
        .lock()
        .map(|buffer| !buffer.is_empty())
        .unwrap_or(false);

      if has_more_output {
        Self::schedule_output_flush(app, project_id, output_buffer, flush_scheduled);
      }
    });
  }

  fn flush_output_now(app: &AppHandle, project_id: &str, output_buffer: &Arc<Mutex<String>>) {
    let pending_output = {
      let Ok(mut buffer) = output_buffer.lock() else {
        return;
      };

      std::mem::take(&mut *buffer)
    };

    if pending_output.is_empty() {
      return;
    }

    let _ = app.emit(
      EVENT_SERVER_OUTPUT,
      OutputPayload {
        project_id: project_id.to_string(),
        output: pending_output,
      },
    );
  }

  fn emit_output_text(app: &AppHandle, project_id: &str, output: &str) {
    let _ = app.emit(
      EVENT_SERVER_OUTPUT,
      OutputPayload {
        project_id: project_id.to_string(),
        output: output.to_string(),
      },
    );
  }
}

fn apply_safe_environment(
  app: &AppHandle,
  project_id: &str,
  config: &DevConfig,
  command: &mut Command,
) {
  let Some(env) = &config.env else {
    return;
  };

  for (key, value) in env {
    if ENV_PROTECTED_KEYS.contains(&key.as_str()) {
      let _ = app.emit(
        EVENT_SERVER_OUTPUT,
        OutputPayload {
          project_id: project_id.to_string(),
          output: format!("[system] skipped protected environment variable \"{key}\"\n"),
        },
      );
      continue;
    }

    command.env(key, value);
  }
}

fn create_shell_command(raw_command: &str) -> Command {
  if cfg!(target_os = "windows") {
    let mut command = Command::new("cmd");
    command.args(["/C", raw_command]);
    return command;
  }

  let mut command = Command::new("sh");
  command.args(["-c", raw_command]);
  command
}

fn current_timestamp_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis() as u64)
    .unwrap_or_default()
}

fn lock_error<T>(_: std::sync::PoisonError<T>) -> String {
  "process state lock poisoned".to_string()
}