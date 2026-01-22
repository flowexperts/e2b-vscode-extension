# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

E2B Sandbox Explorer is a VS Code extension that enables developers to connect to remote E2B sandboxes, browse files, edit code, and run terminal commands - all within VS Code. Think of it as mounting a remote sandbox filesystem directly into your editor.

## Build and Development Commands

```bash
# Install dependencies
bun install

# Compile the extension (creates out/extension.js)
bun run compile

# Watch mode for development (auto-recompiles on changes)
bun run watch

# Package the extension for distribution
bun run package
```

**Important:** The extension uses `esbuild` for bundling (not tsc), configured in package.json scripts. The output is a single bundled CommonJS file at `out/extension.js` that includes all dependencies except `vscode`.

## Architecture

### Extension Lifecycle (src/extension.ts)

The extension activates on two events:
- When the `e2b://` filesystem scheme is accessed
- When the E2B Sandboxes view is opened

On activation:
1. Registers the `e2b://` FileSystemProvider for accessing sandbox files
2. Creates two tree views: Sandboxes list and Files explorer
3. Registers all commands
4. Sets VSCode context variables for conditional UI (e2b.hasApiKey, e2b.connected)

### Core Components

**E2BClient Singleton (src/e2b/client.ts)**
- Wraps the `@e2b/code-interpreter` SDK
- Manages multiple sandbox connections (Map<sandboxId, Sandbox>)
- Handles API key from VSCode settings or E2B_API_KEY env variable
- Provides file operations (read, write, delete, stat, list, rename)
- Executes shell commands on sandboxes
- Manages file index cache (5-minute TTL) for fast search
- Tracks root paths per sandbox for context-aware operations
- Auto-invalidates cache on file system changes

**FileSystemProvider (src/providers/fileSystemProvider.ts)**
- Implements VSCode's FileSystemProvider interface for the `e2b://` scheme
- URI format: `e2b://<sandboxId>/path/to/file`
- Enables native VSCode file operations (open, edit, save, delete) on sandbox files
- Fires file change events to keep VSCode's UI in sync

**Tree View Providers**
- `SandboxListProvider`: Lists all available sandboxes from E2B API, shows connection status, supports filtering by sandbox ID/name/template
- `FileTreeProvider`: Hierarchical view of files in connected sandboxes, supports multi-sandbox connections

**Terminal Integration (src/terminal/sandboxTerminal.ts)**
- Implements VSCode's Pseudoterminal interface
- Creates interactive PTY sessions on sandboxes using E2B's pty API
- Handles terminal I/O (stdin/stdout), resize events, and proper cleanup

### Command Flow

**Connection Flow:**
1. User clicks "Connect" on a sandbox → `e2b.connect` command
2. Extension connects to sandbox via E2B SDK
3. User prompted for directory path (default: `/home/user`)
4. Root path stored in E2BClient for this sandbox
5. Tree views refreshed to show sandbox files
6. Terminal automatically opened for the sandbox
7. Context variable `e2b.connected` set to true

**File Search Flow:**
1. User clicks search icon on sandbox/directory (inline) or right-clicks
2. Check for cached file index (valid for 5 minutes)
3. If cached: User chooses to use cache or refresh
4. If not cached or refresh requested:
   - Auto-detect git repository
   - Git repos: Use `git ls-files` (respects .gitignore)
   - Non-git: Use `find` with built-in ignore patterns
   - Show progress: file count (X / Y files)
   - Cache results for future searches
5. Display fuzzy-searchable file picker
6. On file operations (create/delete/rename), auto-invalidate affected cache entries

**File Operations:**
- Opening files: VSCode requests via FileSystemProvider → e2bClient.readFile() → E2B SDK
- Editing/saving: Changes go through writeFile() to persist on sandbox
- File tree: Commands create/delete files, then refresh the tree view

**Multi-Sandbox Support:**
- Extension supports connecting to multiple sandboxes simultaneously
- Each sandbox gets its own terminal(s), tree view section, and file index cache
- Commands intelligently prompt user to select sandbox when multiple are connected
- File operations scoped to specific sandbox via sandboxId parameter

### VSCode Integration Points

**Context Variables:**
- `e2b.hasApiKey`: Controls whether "Set API Key" welcome view is shown
- `e2b.connected`: Controls visibility of file operations and terminal buttons
- `e2b.sandboxListFiltered`: Controls visibility of "Clear Filter" button in sandbox list

**Conditional UI (package.json):**
- Sandbox list shows when API key is set
- Files view shows when connected
- Commands appear in context menus based on item type (file vs directory vs sandboxRoot)
- Search icon appears inline on sandboxes and directories (not in global toolbar)
- Clear Filter button appears only when sandbox list is filtered

**Activity Bar Integration:**
- All file browsing happens in custom E2B activity bar views
- No workspace folder integration - keeps sandbox files separate from local workspace
- FileSystemProvider enables opening/editing files via `e2b://` URIs

## E2B SDK Usage

The extension uses `@e2b/code-interpreter` (v2.3.3) which provides:
- `Sandbox.list()`: Paginated list of running sandboxes
- `Sandbox.connect()`: Connect to existing sandbox by ID
- `sandbox.files.*`: File operations (read, write, list, remove, makeDir, rename)
- `sandbox.commands.run()`: Execute shell commands (used for file indexing, stat operations)
- `sandbox.pty.*`: PTY/terminal session management

**Note:** File stat and indexing operations use shell commands for performance:
- Stat: `stat -c` or `stat -f` (SDK doesn't expose direct stat API)
- Indexing: `find` with `-prune` for ignores, or `git ls-files` for git repos
- Counting: Piped to `wc -l` for fast totals

## Key Implementation Details

**URI Parsing:**
- Sandbox ID is in the URI authority: `vscode.Uri.authority`
- Path is in `vscode.Uri.path`
- Always use absolute paths (starting with `/`)

**File Index Cache Structure (FileIndexCache interface):**
```typescript
{
  files: Array<{ path: string; name: string }>;  // Indexed files
  timestamp: number;                              // Cache creation time
  path: string;                                   // Root path that was indexed
  useGit: boolean;                                // Whether git ls-files was used
}
```
- Cache key: `${sandboxId}:${path}`
- TTL: 5 minutes (300,000ms)
- Auto-cleanup on stale reads

**Terminal Management:**
- Terminals tracked per sandbox in a Map<sandboxId, Terminal[]>
- Cleanup: Dispose terminals before disconnecting from sandbox
- Uses E2B's PTY API for true interactive shells (not just command execution)

**File Search & Indexing:**
- **Performance**: Uses bash commands (`find`/`git ls-files`) instead of recursive API calls
- **Git Integration**: Auto-detects git repos and respects `.gitignore` using `git ls-files`
- **Built-in Ignores**: Filters common directories when not in git repo:
  - JS/TS: `node_modules`, `dist`, `build`, `.next`, `coverage`
  - Python: `__pycache__`, `venv`, `.pytest_cache`, `*.egg-info`
  - Rust: `target`, Go: `vendor`, Java: `.gradle`, etc.
  - VCS/IDE: `.git`, `.idea`, `.vscode`
- **Caching**: Results cached for 5 minutes, auto-invalidated on file changes
- **Progress**: Real-time progress bars showing "X / Y files" and cancellable
- **Context-Aware**: Search scoped to selected directory or sandbox root

**Cache Invalidation Strategy:**
- File create/delete/rename triggers cache invalidation
- Invalidates affected path + all parent directories up to root
- Example: Creating `/home/user/src/file.ts` invalidates `/home/user/src`, `/home/user`, `/`
- Sandbox disconnect clears all cache for that sandbox

**Tree View Sorting:**
- Directories listed before files
- Alphabetical within each group

**Sandbox List Filtering:**
- `SandboxListProvider.setFilter(text)`: Filter sandboxes by ID, name, or template (case-insensitive)
- `SandboxListProvider.clearFilter()`: Remove active filter
- `SandboxListProvider.isFiltered()`: Check if filter is active
- Filtering updates `e2b.sandboxListFiltered` context variable
- Sandbox IDs are displayed in the description field for easy identification
- Commands: `e2b.searchSandboxes` (search/filter), `e2b.clearSandboxFilter` (clear filter)

## Testing

No formal test suite is currently configured. Test the extension manually:
1. Press F5 in VSCode to launch Extension Development Host
2. Set your E2B API key
3. Connect to a sandbox
4. Test file operations, terminal, and multi-sandbox scenarios
5. Test file search:
   - Search in git repos (verify .gitignore respected)
   - Search in non-git directories (verify built-in ignores work)
   - Test cache: search twice, verify second is instant
   - Create/delete files, verify cache invalidation
   - Test cancellation during indexing
