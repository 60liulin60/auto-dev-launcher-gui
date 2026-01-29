# Implementation Plan: Auto Dev Launcher GUI

## Overview

This implementation plan breaks down the Auto Dev Launcher GUI into discrete coding tasks. The application will be built using Electron and React with TypeScript, following a progressive approach from core infrastructure to UI components to testing.

## Tasks

- [x] 1. Set up project structure and dependencies
  - Initialize Electron + React + TypeScript project with Vite
  - Install dependencies: electron, react, react-dom, fast-check, jest/vitest
  - Configure TypeScript with strict mode
  - Set up build configuration for Electron main and renderer processes
  - Create directory structure (src/main, src/renderer, src/shared)
  - _Requirements: All requirements (foundation)_

- [x] 2. Implement shared types and constants
  - [x] 2.1 Define TypeScript interfaces for data models
    - Create DevConfig, ProjectHistoryEntry, AppSettings, ValidationResult interfaces
    - Create ServerStatus, ServerProcess types
    - Export all types from src/shared/types.ts
    - _Requirements: 1.4, 2.4, 6.1, 6.2_
  
  - [x] 2.2 Define application constants
    - Define storage paths for different platforms
    - Define default window dimensions
    - Define validation rules and error messages
    - _Requirements: 7.4, 8.5_

- [x] 3. Implement main process storage manager
  - [x] 3.1 Create StorageManager class
    - Implement getStoragePath() for platform-specific paths
    - Implement loadProjectHistory() to read history from JSON file
    - Implement saveProjectHistory() to write history to JSON file
    - Implement loadSettings() and saveSettings() for app settings
    - Handle file system errors gracefully
    - _Requirements: 2.2, 2.3, 7.5, 8.5, 9.4_
  
  - [ ]* 3.2 Write property test for storage manager
    - **Property 7: History persistence round-trip**
    - **Validates: Requirements 2.2, 2.3**
  
  - [ ]* 3.3 Write property test for window bounds persistence
    - **Property 27: Window bounds persistence**
    - **Validates: Requirements 7.5**
  
  - [ ]* 3.4 Write property test for platform-appropriate paths
    - **Property 28: Platform-appropriate storage paths**
    - **Validates: Requirements 8.5**
  
  - [ ]* 3.5 Write unit tests for storage error handling
    - Test file read failures
    - Test file write failures
    - Test invalid JSON handling
    - _Requirements: 9.4_

- [x] 4. Implement main process process manager
  - [x] 4.1 Create ProcessManager class
    - Implement startServer() using child_process.spawn
    - Implement stopServer() to kill processes
    - Implement getServerStatus() to check process state
    - Implement onServerOutput() to stream process output
    - Track running processes in a Map<projectId, ServerProcess>
    - _Requirements: 4.1, 4.4, 5.1, 5.2, 5.3_
  
  - [ ]* 4.2 Write property test for server lifecycle
    - **Property 14: Launch button starts server**
    - **Property 19: Server status transitions**
    - **Validates: Requirements 4.1, 5.1, 5.2**
  
  - [ ]* 4.3 Write property test for server output capture
    - **Property 20: Server output display**
    - **Validates: Requirements 5.3**
  
  - [ ]* 4.4 Write unit tests for process error handling
    - Test command not found errors
    - Test process crash handling
    - Test invalid working directory
    - _Requirements: 4.4, 9.2_

- [x] 5. Implement configuration validation
  - [x] 5.1 Create validation functions
    - Implement validateDevConfig() function
    - Check for valid JSON syntax
    - Verify required fields (command, cwd) are present
    - Validate optional fields if present
    - Return ValidationResult with specific error messages
    - _Requirements: 6.1, 6.2, 6.3, 6.5_
  
  - [ ]* 5.2 Write property test for JSON validation
    - **Property 22: JSON syntax validation**
    - **Validates: Requirements 6.1**
  
  - [ ]* 5.3 Write property test for required fields
    - **Property 23: Required fields validation**
    - **Validates: Requirements 6.2**
  
  - [ ]* 5.4 Write property test for optional fields support
    - **Property 26: Optional fields support**
    - **Validates: Requirements 6.5**
  
  - [ ]* 5.5 Write unit tests for validation error messages
    - Test missing command field error
    - Test missing cwd field error
    - Test invalid field type errors
    - _Requirements: 6.3_

- [x] 6. Implement IPC handlers in main process
  - [x] 6.1 Set up IPC communication channels
    - Implement 'project:select-folder' handler using dialog.showOpenDialog
    - Implement 'project:load-config' handler to read dev-config.json
    - Implement 'project:validate-config' handler using validation functions
    - Implement 'server:start', 'server:stop', 'server:get-status' handlers
    - Implement 'history:load', 'history:add', 'history:remove', 'history:clear' handlers
    - Implement 'fs:open-in-explorer' and 'fs:check-path-exists' handlers
    - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 4.1, 10.3_
  
  - [ ]* 6.2 Write unit tests for IPC handlers
    - Test each IPC channel with valid inputs
    - Test error handling for invalid inputs
    - _Requirements: 9.1_

- [ ] 7. Checkpoint - Ensure main process tests pass
  - Run all main process tests
  - Verify storage, process management, and IPC handlers work correctly
  - Ask the user if questions arise

- [ ] 8. Implement project history management hook
  - [ ] 8.1 Create useProjectHistory custom hook
    - Implement loadHistory() to fetch history via IPC
    - Implement addProject() to add/update projects in history
    - Implement removeProject() to remove projects from history
    - Implement clearHistory() to clear all history
    - Manage history state with useState
    - _Requirements: 2.1, 2.2, 2.5, 10.4_
  
  - [ ]* 8.2 Write property test for history deduplication
    - **Property 9: History deduplication (idempotence)**
    - **Validates: Requirements 2.5**
  
  - [ ]* 8.3 Write property test for successful launch adds to history
    - **Property 6: Successful launch adds to history**
    - **Validates: Requirements 2.1**
  
  - [ ]* 8.4 Write unit tests for history operations
    - Test adding new project
    - Test updating existing project timestamp
    - Test removing project
    - _Requirements: 2.1, 2.5, 10.4_

- [ ] 9. Implement server status management hook
  - [ ] 9.1 Create useServerStatus custom hook
    - Implement startServer() to launch via IPC
    - Implement stopServer() to stop via IPC
    - Track server status state (idle, starting, running, stopped, error)
    - Track server output as array of strings
    - Listen to server output events from main process
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3_
  
  - [ ]* 9.2 Write property test for status transitions
    - **Property 19: Server status transitions**
    - **Validates: Requirements 5.1, 5.2**
  
  - [ ]* 9.3 Write unit tests for server status updates
    - Test status changes during server lifecycle
    - Test output accumulation
    - _Requirements: 5.1, 5.2, 5.3_

- [ ] 10. Implement Toolbar component
  - [ ] 10.1 Create Toolbar React component
    - Add folder selection button that triggers IPC call
    - Add refresh button to reload project list
    - Add clear history button with confirmation dialog
    - Style toolbar with appropriate layout
    - _Requirements: 1.1, 7.1, 10.5_
  
  - [ ]* 10.2 Write property test for folder picker trigger
    - **Property 1: Folder picker displays on button click**
    - **Validates: Requirements 1.1**
  
  - [ ]* 10.3 Write unit tests for toolbar interactions
    - Test button click handlers
    - Test confirmation dialog for clear history
    - _Requirements: 1.1, 10.5_

- [ ] 11. Implement ProjectList component
  - [ ] 11.1 Create ProjectList React component
    - Display projects in a scrollable list
    - Show project name, path, and last launch time for each entry
    - Highlight selected project
    - Sort projects by last launch time (descending)
    - Show empty state message when no projects
    - Implement right-click context menu
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 10.1, 10.2, 10.3_
  
  - [ ]* 11.2 Write property test for all projects displayed
    - **Property 10: All history projects displayed**
    - **Validates: Requirements 3.1**
  
  - [ ]* 11.3 Write property test for project information display
    - **Property 11: Project display information completeness**
    - **Validates: Requirements 3.2**
  
  - [ ]* 11.4 Write property test for sorting invariant
    - **Property 13: History sorting invariant**
    - **Validates: Requirements 3.5**
  
  - [ ]* 11.5 Write property test for selection highlighting
    - **Property 12: Project selection highlighting**
    - **Validates: Requirements 3.4**
  
  - [ ]* 11.6 Write property test for context menu display
    - **Property 32: Context menu on right-click**
    - **Validates: Requirements 10.1**
  
  - [ ]* 11.7 Write unit tests for empty state and edge cases
    - Test empty project list display
    - Test single project display
    - Test context menu actions
    - _Requirements: 3.3, 10.2, 10.3_

- [ ] 12. Implement ProjectDetails component
  - [ ] 12.1 Create ProjectDetails React component
    - Display selected project information
    - Show project name, path, and configuration details
    - Display launch button (enabled/disabled based on status)
    - Display stop button when server is running
    - Show loading indicator during server startup
    - Show success/error status messages
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 6.4, 7.3_
  
  - [ ]* 12.2 Write property test for launch button behavior
    - **Property 14: Launch button starts server**
    - **Property 18: Launch button disabled when running**
    - **Validates: Requirements 4.1, 4.5**
  
  - [ ]* 12.3 Write property test for loading indicator
    - **Property 15: Loading indicator during startup**
    - **Validates: Requirements 4.2**
  
  - [ ]* 12.4 Write property test for status messages
    - **Property 16: Success status on successful start**
    - **Property 17: Error message on start failure**
    - **Validates: Requirements 4.3, 4.4**
  
  - [ ]* 12.5 Write unit tests for button states
    - Test launch button enabled with valid config
    - Test launch button disabled when running
    - Test stop button visibility
    - _Requirements: 4.5, 6.4_

- [ ] 13. Implement ServerOutput component
  - [ ] 13.1 Create ServerOutput React component
    - Display server output in a scrollable log viewer
    - Auto-scroll to bottom when new output arrives
    - Format output with timestamps
    - Support text wrapping for long lines
    - _Requirements: 5.3, 5.4, 7.3_
  
  - [ ]* 13.2 Write property test for output display
    - **Property 20: Server output display**
    - **Validates: Requirements 5.3**
  
  - [ ]* 13.3 Write property test for auto-scroll
    - **Property 21: Auto-scroll to latest output**
    - **Validates: Requirements 5.4**
  
  - [ ]* 13.4 Write unit tests for output formatting
    - Test output rendering
    - Test scroll behavior
    - _Requirements: 5.3, 5.4_

- [ ] 14. Implement MainWindow component
  - [ ] 14.1 Create MainWindow root component
    - Set up application layout with left and right panels
    - Place Toolbar at the top
    - Place ProjectList in left panel
    - Place ProjectDetails and ServerOutput in right panel
    - Manage selected project state
    - Integrate useProjectHistory and useServerStatus hooks
    - Handle folder selection workflow
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 7.1, 7.2, 7.3_
  
  - [ ]* 14.2 Write property test for directory selection
    - **Property 2: Valid directory selection loads project**
    - **Property 3: Cancel preserves state**
    - **Validates: Requirements 1.2, 1.3**
  
  - [ ]* 14.3 Write property test for config file handling
    - **Property 4: Config file parsing**
    - **Property 5: Missing config error handling**
    - **Validates: Requirements 1.4, 1.5**
  
  - [ ]* 14.4 Write integration tests for main workflows
    - Test complete project launch workflow
    - Test project selection and details display
    - Test history management workflow
    - _Requirements: 1.2, 1.4, 2.1, 4.1_

- [ ] 15. Implement error handling and user feedback
  - [ ] 15.1 Create error display components
    - Create ErrorDialog component for modal error messages
    - Create ErrorNotification component for inline errors
    - Implement error logging to file
    - Add error boundaries for React components
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
  
  - [ ]* 15.2 Write property test for error message display
    - **Property 29: Error message display**
    - **Validates: Requirements 9.1, 9.2, 9.4**
  
  - [ ]* 15.3 Write property test for non-existent project handling
    - **Property 30: Non-existent project removal offer**
    - **Validates: Requirements 9.3**
  
  - [ ]* 15.4 Write property test for error logging
    - **Property 31: Error logging**
    - **Validates: Requirements 9.5**
  
  - [ ]* 15.5 Write unit tests for error scenarios
    - Test file system errors
    - Test configuration errors
    - Test process errors
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] 16. Implement application initialization and window management
  - [x] 16.1 Set up Electron main process entry point
    - Create BrowserWindow with default dimensions
    - Load renderer process HTML
    - Restore saved window bounds on startup
    - Save window bounds on close
    - Handle app lifecycle events (ready, window-all-closed, activate)
    - _Requirements: 7.4, 7.5_
  
  - [ ]* 16.2 Write unit tests for window management
    - Test default window size
    - Test window bounds restoration
    - _Requirements: 7.4, 7.5_

- [ ] 17. Checkpoint - Ensure all UI tests pass
  - Run all renderer process tests
  - Verify all components render correctly
  - Test user interactions and workflows
  - Ask the user if questions arise

- [ ] 18. Add styling and polish
  - [ ] 18.1 Implement application styling
    - Create CSS modules or Tailwind configuration
    - Style all components with consistent design
    - Add hover states and transitions
    - Ensure responsive layout
    - Add icons for buttons and status indicators
    - _Requirements: 7.1, 7.2, 7.3_
  
  - [ ] 18.2 Implement accessibility features
    - Add ARIA labels to all interactive elements
    - Ensure keyboard navigation works
    - Add focus indicators
    - Test with screen readers
    - _Requirements: 7.1, 7.2, 7.3_

- [ ] 19. Build and package application
  - [ ] 19.1 Configure electron-builder
    - Set up build configuration for Windows, macOS, Linux
    - Configure application icons
    - Set up code signing (if applicable)
    - Configure auto-updater (optional)
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [ ] 19.2 Test builds on all platforms
    - Build and test Windows executable
    - Build and test macOS app bundle
    - Build and test Linux AppImage/deb
    - Verify platform-specific features work correctly
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 20. Final integration testing and validation
  - [ ]* 20.1 Run complete property test suite
    - Execute all 33 property tests
    - Verify 100+ iterations per test
    - Ensure all properties pass
    - _Requirements: All requirements_
  
  - [ ]* 20.2 Run complete unit test suite
    - Execute all unit tests
    - Verify 80%+ code coverage
    - Fix any failing tests
    - _Requirements: All requirements_
  
  - [ ] 20.3 Perform manual end-to-end testing
    - Test complete user workflows on each platform
    - Verify error handling and edge cases
    - Test with real development projects
    - _Requirements: All requirements_

- [ ] 21. Final checkpoint - Ensure all tests pass
  - Verify all property tests pass (100+ iterations each)
  - Verify all unit tests pass
  - Verify integration tests pass
  - Confirm application builds successfully for all platforms
  - Ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases
- Integration tests verify end-to-end workflows
- The implementation follows a bottom-up approach: infrastructure → business logic → UI → integration
