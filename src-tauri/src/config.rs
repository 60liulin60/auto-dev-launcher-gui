use crate::types::{DevConfig, ValidationError, ValidationResult};
use regex::Regex;
use serde_json::Value;
use std::{
  env,
  fs,
  path::{Component, Path, PathBuf},
};

const MAX_PATH_LENGTH: usize = 4096;
const MAX_COMMAND_LENGTH: usize = 1000;

pub fn load_project_config(project_path: &str) -> Result<DevConfig, String> {
  let project_path = sanitize_path(project_path)?;
  validate_existing_directory(&project_path)?;

  let dev_config_path = project_path.join("dev-config.json");
  if dev_config_path.exists() {
    let content = fs::read_to_string(&dev_config_path)
      .map_err(|error| format!("无法读取 dev-config.json: {error}"))?;
    let config = serde_json::from_str::<DevConfig>(&content)
      .map_err(|error| format!("dev-config.json 不是有效的 JSON: {error}"))?;

    validate_dev_config_or_error(&config)?;
    return Ok(config);
  }

  let package_json_path = project_path.join("package.json");
  if package_json_path.exists() {
    return build_auto_config(&project_path);
  }

  Err("未找到 dev-config.json 或 package.json 文件".to_string())
}

pub fn sanitize_path(input: &str) -> Result<PathBuf, String> {
  let trimmed = input.trim();
  if trimmed.is_empty() {
    return Err("路径不能为空".to_string());
  }

  if trimmed.len() > MAX_PATH_LENGTH {
    return Err("路径长度超出限制".to_string());
  }

  let raw_path = Path::new(trimmed);
  if raw_path
    .components()
    .any(|component| matches!(component, Component::ParentDir))
  {
    return Err("路径包含非法的上级目录引用".to_string());
  }

  if raw_path.is_absolute() {
    return Ok(raw_path.to_path_buf());
  }

  let current_dir = env::current_dir().map_err(|error| format!("无法解析当前目录: {error}"))?;
  Ok(current_dir.join(raw_path))
}

pub fn validate_project_directory(path: &Path) -> Result<(), String> {
  validate_existing_directory(path)?;

  if path.join("package.json").exists() || path.join("dev-config.json").exists() {
    return Ok(());
  }

  Err("目录中未找到 dev-config.json 或 package.json 文件".to_string())
}

pub fn detect_package_manager(project_path: &Path) -> String {
  if project_path.join("pnpm-lock.yaml").exists() {
    return "pnpm".to_string();
  }

  if project_path.join("yarn.lock").exists() {
    return "yarn".to_string();
  }

  "npm".to_string()
}

pub fn validate_dev_config(config: &DevConfig) -> ValidationResult {
  let mut errors = Vec::new();

  if config.command.trim().is_empty() {
    errors.push(ValidationError {
      field: "command".to_string(),
      message: "命令不能为空".to_string(),
    });
  } else {
    if config.command.len() > MAX_COMMAND_LENGTH {
      errors.push(ValidationError {
        field: "command".to_string(),
        message: "命令长度超出限制".to_string(),
      });
    }

    let lowered = config.command.to_lowercase();
    let dangerous_patterns = [
      "rm -rf /",
      "format c:",
      "shutdown -s",
      "taskkill /im explorer.exe",
    ];

    if dangerous_patterns
      .iter()
      .any(|pattern| lowered.contains(pattern))
    {
      errors.push(ValidationError {
        field: "command".to_string(),
        message: "命令包含潜在危险操作".to_string(),
      });
    }
  }

  if config.cwd.trim().is_empty() {
    errors.push(ValidationError {
      field: "cwd".to_string(),
      message: "工作目录不能为空".to_string(),
    });
  }

  if let Some(port) = config.port {
    if port == 0 {
      errors.push(ValidationError {
        field: "port".to_string(),
        message: "端口号必须在 1-65535 之间".to_string(),
      });
    }
  }

  if let Some(name) = &config.name {
    if name.trim().is_empty() {
      errors.push(ValidationError {
        field: "name".to_string(),
        message: "项目名称不能为空字符串".to_string(),
      });
    }
  }

  if let Some(env) = &config.env {
    let env_key_pattern = Regex::new(r"^[A-Z_][A-Z0-9_]*$").expect("valid env regex");

    for (key, value) in env {
      if !env_key_pattern.is_match(key) {
        errors.push(ValidationError {
          field: "env".to_string(),
          message: format!("环境变量名格式无效: {key}"),
        });
      }

      if value.len() > MAX_COMMAND_LENGTH {
        errors.push(ValidationError {
          field: "env".to_string(),
          message: format!("环境变量值过长: {key}"),
        });
      }
    }
  }

  ValidationResult {
    valid: errors.is_empty(),
    errors,
  }
}

pub fn validate_dev_config_or_error(config: &DevConfig) -> Result<(), String> {
  let result = validate_dev_config(config);
  if result.valid {
    return Ok(());
  }

  let message = result
    .errors
    .into_iter()
    .map(|error| error.message)
    .collect::<Vec<_>>()
    .join(", ");

  Err(message)
}

pub fn sanitize_command(command: &str) -> Result<String, String> {
  let trimmed = command.trim();
  if trimmed.is_empty() {
    return Err("命令不能为空".to_string());
  }

  let command_substitution = Regex::new(r"\$\([^)]*\)").expect("valid command regex");
  let variable_substitution = Regex::new(r"\$\{[^}]*\}").expect("valid variable regex");
  let backticks = Regex::new(r"`[^`]*`").expect("valid backtick regex");

  let sanitized = backticks
    .replace_all(
      &variable_substitution.replace_all(
        &command_substitution.replace_all(trimmed, ""),
        "",
      ),
      "",
    )
    .trim()
    .to_string();

  if sanitized.is_empty() {
    return Err("命令清理后为空".to_string());
  }

  Ok(sanitized)
}

fn build_auto_config(project_path: &Path) -> Result<DevConfig, String> {
  let package_json_path = project_path.join("package.json");
  let content = fs::read_to_string(&package_json_path)
    .map_err(|error| format!("无法读取 package.json: {error}"))?;
  let package_json = serde_json::from_str::<Value>(&content)
    .map_err(|error| format!("package.json 不是有效的 JSON: {error}"))?;

  let scripts = package_json
    .get("scripts")
    .and_then(Value::as_object);

  let start_script = if scripts.and_then(|value| value.get("dev")).is_some() {
    "dev"
  } else if scripts.and_then(|value| value.get("start")).is_some() {
    "start"
  } else if scripts.and_then(|value| value.get("serve")).is_some() {
    "serve"
  } else {
    "start"
  };

  let project_name = package_json
    .get("name")
    .and_then(Value::as_str)
    .map(|value| value.to_string())
    .or_else(|| {
      project_path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
    });

  let package_manager = detect_package_manager(project_path);

  Ok(DevConfig {
    name: project_name,
    command: format!("{package_manager} run {start_script}"),
    cwd: project_path.to_string_lossy().to_string(),
    env: None,
    port: None,
  })
}

fn validate_existing_directory(path: &Path) -> Result<(), String> {
  if !path.exists() {
    return Err("项目路径不存在".to_string());
  }

  if !path.is_dir() {
    return Err("项目路径不是有效目录".to_string());
  }

  Ok(())
}
