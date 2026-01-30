# Design Document: Icon Display Fix

## Overview

This design addresses the Electron application icon display issue by implementing a comprehensive icon management system. The solution ensures proper icon display across all Windows contexts including development mode, packaged applications, installers, and desktop shortcuts.

The core challenge is that Windows requires ICO files with multiple embedded resolutions, and the Windows icon cache can prevent updated icons from displaying. This design provides automated icon validation, generation, configuration, and cache management to ensure reliable icon display.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Icon Management System                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Validator  │  │  Converter   │  │ Configurator │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘              │
│                            │                                 │
│                    ┌───────▼────────┐                        │
│                    │  Icon Manager  │                        │
│                    └───────┬────────┘                        │
│                            │                                 │
├────────────────────────────┼─────────────────────────────────┤
│                            │                                 │
│  ┌─────────────────────────▼──────────────────────────┐     │
│  │           Electron Application Layer                │     │
│  │  ┌──────────────┐         ┌──────────────┐        │     │
│  │  │ Main Process │         │   Builder    │        │     │
│  │  │  (Runtime)   │         │  (Build Time)│        │     │
│  │  └──────────────┘         └──────────────┘        │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Component Interaction Flow

```
Build Time:
  PNG Source → Validator → Converter → ICO File → Builder Config → Package

Runtime:
  Icon Path → Validator → BrowserWindow Config → Display

Cache Management:
  Install/Update → NSIS Script → Clear Cache → Refresh Explorer
```

## Components and Interfaces

### 1. Icon Validator

**Purpose:** Validates icon files meet format and size requirements

**Interface:**
```typescript
interface IconValidator {
  /**
   * Validates PNG source file dimensions
   * @param pngPath - Path to PNG file
   * @returns Validation result with dimensions
   */
  validatePNG(pngPath: string): Promise<ValidationResult>
  
  /**
   * Validates ICO file contains all required resolutions
   * @param icoPath - Path to ICO file
   * @returns Validation result with found resolutions
   */
  validateICO(icoPath: string): Promise<ValidationResult>
  
  /**
   * Validates all icon files exist at configured paths
   * @param config - Build configuration
   * @returns Validation result for all paths
   */
  validatePaths(config: BuildConfig): Promise<ValidationResult>
}

interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  metadata?: IconMetadata
}

interface ValidationError {
  code: string
  message: string
  path: string
  expected?: any
  actual?: any
}

interface IconMetadata {
  dimensions?: { width: number; height: number }
  resolutions?: number[]
  fileSize?: number
  format?: string
}
```

**Implementation Details:**
- Use `sharp` library for PNG validation and dimension checking
- Use `ico-parser` or custom parser for ICO resolution detection
- Validate file existence using `fs.existsSync()`
- Provide detailed error messages with remediation steps

### 2. Icon Converter

**Purpose:** Converts PNG source to multi-resolution ICO files

**Interface:**
```typescript
interface IconConverter {
  /**
   * Converts PNG to ICO with multiple resolutions
   * @param pngPath - Source PNG file path
   * @param icoPath - Output ICO file path
   * @param options - Conversion options
   * @returns Conversion result
   */
  convertPNGToICO(
    pngPath: string,
    icoPath: string,
    options?: ConversionOptions
  ): Promise<ConversionResult>
  
  /**
   * Generates all required icon formats for all platforms
   * @param pngPath - Source PNG file path
   * @param outputDir - Output directory
   * @returns Conversion results for all formats
   */
  generateAllFormats(
    pngPath: string,
    outputDir: string
  ): Promise<ConversionResult[]>
}

interface ConversionOptions {
  resolutions?: number[]  // Default: [16, 32, 48, 64, 128, 256]
  quality?: number        // Default: 100
  resamplingAlgorithm?: 'lanczos3' | 'cubic' | 'mitchell'
}

interface ConversionResult {
  success: boolean
  outputPath: string
  resolutions: number[]
  errors?: string[]
}
```

**Implementation Details:**
- Use `sharp` for high-quality image resizing
- Use `to-ico` or `png-to-ico` for ICO file generation
- Default resampling: Lanczos3 for best quality
- Generate all resolutions in a single ICO file
- Validate output ICO file after generation

### 3. Icon Configurator

**Purpose:** Configures Electron and electron-builder for proper icon usage

**Interface:**
```typescript
interface IconConfigurator {
  /**
   * Configures BrowserWindow icon for runtime
   * @param isDevelopment - Whether in development mode
   * @returns Icon path for BrowserWindow
   */
  getBrowserWindowIconPath(isDevelopment: boolean): string
  
  /**
   * Validates electron-builder configuration
   * @param packageJson - package.json content
   * @returns Validation result
   */
  validateBuilderConfig(packageJson: any): ValidationResult
  
  /**
   * Generates electron-builder icon configuration
   * @param platform - Target platform
   * @returns Builder configuration object
   */
  generateBuilderConfig(platform: 'win' | 'mac' | 'linux'): BuilderIconConfig
}

interface BuilderIconConfig {
  win?: {
    icon: string
    target: any[]
  }
  nsis?: {
    installerIcon: string
    uninstallerIcon: string
    installerHeaderIcon: string
  }
  mac?: {
    icon: string
  }
  linux?: {
    icon: string
  }
}
```

**Implementation Details:**
- Development mode: Use PNG directly for faster iteration
- Production mode: Use platform-specific format (ICO for Windows)
- Path resolution: Relative to `__dirname` in main process
- Validate paths exist before returning configuration

### 4. Cache Manager

**Purpose:** Manages Windows icon cache clearing

**Interface:**
```typescript
interface CacheManager {
  /**
   * Clears Windows icon cache
   * @returns Operation result
   */
  clearIconCache(): Promise<OperationResult>
  
  /**
   * Restarts Windows Explorer to refresh icons
   * @returns Operation result
   */
  restartExplorer(): Promise<OperationResult>
  
  /**
   * Generates NSIS script for cache clearing
   * @returns NSIS script content
   */
  generateNSISCacheScript(): string
}

interface OperationResult {
  success: boolean
  message: string
  requiresRestart?: boolean
}
```

**Implementation Details:**
- Execute `ie4uinit.exe -ClearIconCache` for cache clearing
- Kill and restart `explorer.exe` for immediate refresh
- Generate NSIS custom script for installer integration
- Provide PowerShell script for manual cache clearing

### 5. Diagnostic Tools

**Purpose:** Provides troubleshooting and validation utilities

**Interface:**
```typescript
interface DiagnosticTools {
  /**
   * Runs comprehensive icon diagnostics
   * @returns Diagnostic report
   */
  runDiagnostics(): Promise<DiagnosticReport>
  
  /**
   * Checks specific icon file
   * @param path - Icon file path
   * @returns File diagnostic result
   */
  checkIconFile(path: string): Promise<FileDiagnostic>
  
  /**
   * Validates entire build configuration
   * @returns Configuration diagnostic result
   */
  checkBuildConfig(): Promise<ConfigDiagnostic>
}

interface DiagnosticReport {
  timestamp: Date
  overall: 'pass' | 'warning' | 'fail'
  checks: DiagnosticCheck[]
  recommendations: string[]
}

interface DiagnosticCheck {
  name: string
  status: 'pass' | 'warning' | 'fail'
  message: string
  details?: any
}
```

**Implementation Details:**
- Check PNG dimensions (should be 1024x1024)
- Check ICO resolutions (should contain 16, 32, 48, 64, 128, 256)
- Validate package.json configuration
- Check file existence at all configured paths
- Verify main process icon configuration
- Output formatted report with color coding

## Data Models

### Icon Configuration

```typescript
interface IconConfig {
  // Source files
  pngSource: string          // Path to 1024x1024 PNG
  icoFile: string            // Path to multi-resolution ICO
  
  // Build configuration
  buildResourcesDir: string  // electron-builder resources directory
  
  // Platform-specific paths
  win: {
    icon: string
    installerIcon: string
    uninstallerIcon: string
  }
  
  // Validation settings
  requiredResolutions: number[]
  minPNGSize: { width: number; height: number }
}

// Default configuration
const DEFAULT_ICON_CONFIG: IconConfig = {
  pngSource: 'build/icon.png',
  icoFile: 'build/icon.ico',
  buildResourcesDir: 'build',
  win: {
    icon: 'build/icon.ico',
    installerIcon: 'build/icon.ico',
    uninstallerIcon: 'build/icon.ico'
  },
  requiredResolutions: [16, 32, 48, 64, 128, 256],
  minPNGSize: { width: 1024, height: 1024 }
}
```

### Build Configuration

```typescript
interface BuildConfig {
  appId: string
  productName: string
  directories: {
    output: string
    buildResources: string
  }
  files: string[]
  win: {
    icon: string
    target: BuildTarget[]
    signAndEditExecutable?: boolean
  }
  nsis: {
    oneClick: boolean
    allowToChangeInstallationDirectory: boolean
    createDesktopShortcut: boolean
    createStartMenuShortcut: boolean
    installerIcon: string
    uninstallerIcon: string
    installerHeaderIcon: string
    include?: string  // Custom NSIS script for cache clearing
  }
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Before writing the correctness properties, I need to analyze which acceptance criteria are testable using property-based testing.

