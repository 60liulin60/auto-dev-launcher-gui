# Build the Go/Wails refactor without launching the app.
[CmdletBinding()]
param(
  # Installer creates an NSIS installer; Portable creates a standalone EXE.
  [ValidateSet('Portable', 'Installer')]
  [string]$Package = 'Installer'
)

$ErrorActionPreference = 'Stop'
# Use the invoked script path because some integrated PowerShell hosts do not populate PSScriptRoot.
$scriptPath = $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($scriptPath)) {
  throw 'Could not resolve the build script path. Run this script by its file path, not by pasting its contents.'
}
$Root = Split-Path -Parent (Split-Path -Parent $scriptPath)
Set-Location $Root

# Keep Go's build cache in the repository-level temporary directory.
$cacheRoot = Join-Path $Root '.tmp\go-build'
New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
$env:GOCACHE = $cacheRoot

# Some integrated PowerShell hosts do not inherit the user PATH. These are
# explicit known installation locations, so avoid Join-Path host quirks here.
$toolBins = @(
  'C:\Program Files\Go\bin',
  'C:\Users\Administrator.DESKTOP-068VNB6\go\bin',
  'C:\Program Files (x86)\NSIS',
  'C:\Program Files\NSIS'
)
foreach ($toolBin in $toolBins) {
  if ((Test-Path -LiteralPath $toolBin) -and (($env:Path -split ';') -notcontains $toolBin)) {
    $env:Path = "$toolBin;$env:Path"
  }
}

if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
  Write-Error 'Go was not found. Install Go 1.22+ and ensure it is on PATH.'
}

# The configured module proxy is reachable in this environment, but SumDB is not.
# Scope this setting to the build process only; do not change the user's global Go settings.
$env:GONOSUMDB = '*'

Push-Location desktop/frontend
try {
  # Always rebuild the frontend bundle. It is embedded into the exe via
  # //go:embed all:frontend/dist, so a stale dist/ silently bakes old CSS/TSX
  # into the packaged app. Only skip dependency install when node_modules exists.
  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    if (-not (Test-Path -LiteralPath 'node_modules')) {
      pnpm install
    }
    pnpm run build
  } elseif (Get-Command npm -ErrorAction SilentlyContinue) {
    if (-not (Test-Path -LiteralPath 'node_modules')) {
      npm install
    }
    npm run build
  } else {
    Write-Error 'Neither pnpm nor npm was found on PATH; cannot rebuild the frontend bundle.'
  }
} finally {
  Pop-Location
}

go test ./...
if ($LASTEXITCODE -ne 0) {
  throw 'Go tests failed. Installer build was stopped.'
}

if ($Package -eq 'Installer') {
  if (-not (Get-Command wails -ErrorAction SilentlyContinue)) {
    Write-Error 'Wails CLI was not found. Run: go install github.com/wailsapp/wails/v2/cmd/wails@latest'
  }
  if (-not (Get-Command makensis -ErrorAction SilentlyContinue)) {
    Write-Error 'NSIS was not found. Install NSIS, reopen the terminal, and ensure makensis is on PATH.'
  }

  Push-Location desktop
  try {
    # This is a nested module. Build its lock file once using the local module cache,
    # then let Wails package the already-built frontend without rebuilding it again.
    go mod tidy
    if ($LASTEXITCODE -ne 0) {
      throw 'Desktop module preparation failed.'
    }
    wails build -nsis -s -m -nosyncgomod
    if ($LASTEXITCODE -ne 0) {
      throw 'Wails failed to generate the NSIS installer.'
    }
  } finally {
    Pop-Location
  }
  Write-Host "Installer created under: $Root\desktop\build\bin"
} else {
  New-Item -ItemType Directory -Force -Path bin | Out-Null
  # windowsgui hides the console window for the standalone desktop EXE.
  go build -tags production -ldflags '-H windowsgui' -o bin/auto-dev-launcher.exe ./desktop
  Write-Host "Portable EXE created: $Root\bin\auto-dev-launcher.exe"
}

Write-Host 'The application was not started.'
