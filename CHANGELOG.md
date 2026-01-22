# Changelog

All notable changes to the E2B Sandbox Explorer extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2026-01-22

### Documentation
- Added comprehensive CHANGELOG.md
- Updated README with marketplace badges and screenshots
- Added PUBLISHING.md guide for extension publication

## [0.1.2] - 2026-01-22

### Documentation
- Added comprehensive CHANGELOG.md
- Updated README with marketplace badges and screenshots
- Added PUBLISHING.md guide for extension publication

## [0.1.0] - 2026-01-22

### Added
- **Core Functionality**
  - List all running E2B sandboxes
  - Connect to sandboxes and visualize files in tree view
  - Browse and navigate sandbox file systems
  - Open, edit, and save files with full VS Code integration
  - Create and delete files and folders
  - FileSystemProvider for `e2b://` URI scheme

- **Terminal Integration**
  - Interactive PTY terminal sessions for sandboxes
  - Multiple terminals per sandbox support
  - Proper terminal cleanup on disconnect
  - Full shell support with proper input/output handling

- **Multi-Sandbox Support**
  - Connect to multiple sandboxes simultaneously
  - Visual connection status indicators
  - Sandbox-specific file trees and terminals

- **Smart File Search**
  - Fast file indexing with real-time progress tracking
  - Git integration: automatically detects and respects `.gitignore`
  - Built-in ignore patterns for common directories (node_modules, venv, target, etc.)
  - Intelligent caching system (5-minute TTL)
  - Auto-invalidation of cache on file operations
  - Context-aware search (sandbox-wide or directory-specific)
  - Fuzzy search through indexed files

- **Configuration**
  - Customizable API key storage (settings or environment variable)
  - Configurable search ignore patterns (`e2b.searchIgnorePatterns`)
  - Settings UI for easy configuration

- **UI/UX Enhancements**
  - Custom activity bar view for E2B sandboxes
  - Dedicated Files view for connected sandboxes
  - Welcome views for first-time setup
  - Inline action buttons (search, connect, terminal)
  - Extension icon and branding

### Fixed
- Sandbox connected status indicator color
- Sandbox connected check mark visibility
- File viewer rendering issues
- Delayed sandbox file tree creation to ensure workspace is ready
- Terminal PTY session handling for better user experience

### Changed
- Moved file search ignore patterns from hardcoded to user-configurable settings
- Improved terminal experience using PTY instead of simple command execution

## [Unreleased]

### Planned
- File rename functionality
- Drag-and-drop file upload
- Download files from sandbox
- Workspace integration option
- Custom syntax highlighting themes
- Performance metrics and diagnostics

---

[0.1.2]: https://github.com/e2b-dev/vscode-extension/releases/tag/v0.1.2
[0.1.0]: https://github.com/e2b-dev/vscode-extension/releases/tag/v0.1.0
