# 脚本说明

## `clean.js`

清理当前仓库的构建产物：

- `dist/`
- `release/`
- `release-final/`
- `src-tauri/target/release/bundle/`

执行方式：

```bash
pnpm run clean
```

## `verify-icon.js`

校验 Tauri 打包所需的图标资源与配置：

- `src-tauri/tauri.conf.json`
- `src-tauri/icons/icon.png`
- `src-tauri/icons/icon.ico`

执行方式：

```bash
pnpm run verify:icon
```

## `generate-icon.js`

用于生成或更新应用图标资源，供 `build/` 与 `src-tauri/icons/` 复用。
