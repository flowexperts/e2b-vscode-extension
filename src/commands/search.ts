import * as vscode from 'vscode';
import { e2bClient } from '../e2b/client';
import { sandboxListProvider } from '../providers/sandboxListProvider';

export async function searchFilesCommand(item?: any): Promise<void> {
  if (!e2bClient.isConnected) {
    vscode.window.showErrorMessage('Not connected to any sandbox');
    return;
  }

  // Get sandboxId from item or ask user to select
  let sandboxId: string;
  let startPath: string;

  if (item?.sandboxId) {
    // Item provided (SandboxRootItem or FileItem)
    sandboxId = item.sandboxId;
    if (item.fileInfo) {
      // FileItem - use its path, or parent directory if it's a file
      startPath = item.fileInfo.isDir ? item.fileInfo.path : item.fileInfo.path.substring(0, item.fileInfo.path.lastIndexOf('/')) || '/';
    } else if (item.rootPath) {
      // SandboxRootItem - use its root path
      startPath = item.rootPath;
    } else {
      // Fallback to stored root path
      startPath = e2bClient.getRootPath(sandboxId);
    }
  } else {
    // No item provided - ask user to select sandbox
    const connectedIds = e2bClient.getConnectedSandboxIds();
    if (connectedIds.length === 0) {
      vscode.window.showErrorMessage('Not connected to any sandbox');
      return;
    }
    if (connectedIds.length === 1) {
      sandboxId = connectedIds[0];
    } else {
      const selected = await vscode.window.showQuickPick(connectedIds, {
        placeHolder: 'Select sandbox to search files in',
      });
      if (!selected) {
        return;
      }
      sandboxId = selected;
    }
    startPath = e2bClient.getRootPath(sandboxId);
  }

  // Check if we have cached results
  const cachedIndex = e2bClient.getFileIndexCache(sandboxId, startPath);
  let allFiles: Array<{ path: string; name: string }> | null;

  if (cachedIndex) {
    // Ask user if they want to use cache or refresh
    const cacheAge = Math.floor((Date.now() - cachedIndex.timestamp) / 1000);
    const ageStr = cacheAge < 60 ? `${cacheAge}s ago` : `${Math.floor(cacheAge / 60)}m ago`;
    const choice = await vscode.window.showQuickPick(
      [
        { label: '$(database) Use Cached Index', description: `${cachedIndex.files.length} files, indexed ${ageStr}`, value: 'cache' },
        { label: '$(refresh) Refresh Index', description: 'Re-scan directory for latest files', value: 'refresh' }
      ],
      {
        placeHolder: 'File index cache available'
      }
    );

    if (!choice) {
      return; // User cancelled
    }

    if (choice.value === 'cache') {
      allFiles = cachedIndex.files;
    } else {
      // Force refresh - run the indexing below
      allFiles = await indexFiles(sandboxId, startPath);
    }
  } else {
    // No cache available - run the indexing
    allFiles = await indexFiles(sandboxId, startPath);
  }

  // Build find command with ignore patterns from configuration
  function buildFindCommandWithIgnores(startPath: string, fileType: 'f' | 'd' = 'f'): string {
    // Get ignore patterns from configuration
    const config = vscode.workspace.getConfiguration('e2b');
    const ignorePatterns = config.get<string[]>('searchIgnorePatterns') || [];

    // Build prune conditions
    const pruneConditions = ignorePatterns
      .map(pattern => `-name "${pattern}" -prune`)
      .join(' -o ');

    return `find "${startPath}" \\( ${pruneConditions} \\) -o -type ${fileType} -print 2>/dev/null`;
  }

  async function indexFiles(sandboxId: string, startPath: string): Promise<Array<{ path: string; name: string }> | null> {
    return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Indexing files in ${startPath}...`,
      cancellable: true,
    },
    async (progress, token) => {
      let totalFiles = 0;
      let useGit = false;

      // Check if the path is inside a git repository
      progress.report({ message: 'Checking for git repository...' });

      try {
        const gitCheckCommand = `cd "${startPath}" && git rev-parse --is-inside-work-tree 2>/dev/null`;
        const gitCheck = await e2bClient.runCommand(gitCheckCommand, sandboxId);
        useGit = gitCheck.exitCode === 0 && gitCheck.stdout.trim() === 'true';
      } catch (error) {
        useGit = false;
      }

      if (token.isCancellationRequested) return null;

      // First pass: Count total files using fast bash command
      progress.report({ message: useGit ? 'Counting files (respecting .gitignore)...' : 'Counting files (ignoring common dirs)...' });

      try {
        let countCommand: string;

        if (useGit) {
          // Use git ls-files which respects .gitignore
          countCommand = `cd "${startPath}" && git ls-files 2>/dev/null | wc -l`;
        } else {
          // Use find command with ignore patterns
          countCommand = `${buildFindCommandWithIgnores(startPath, 'f')} | wc -l`;
        }

        const result = await e2bClient.runCommand(countCommand, sandboxId);

        if (result.exitCode === 0) {
          totalFiles = parseInt(result.stdout.trim() || '0', 10);
        } else {
          totalFiles = 0;
        }
      } catch (error) {
        console.error('Error counting files:', error);
        // Continue without counts
      }

      if (token.isCancellationRequested) return null;

      // Second pass: Build file list using fast bash command
      const files: Array<{ path: string; name: string }> = [];
      const hasTotals = totalFiles > 0;

      try {
        // Use git ls-files or find to get all files at once
        progress.report({ message: useGit ? 'Loading files (respecting .gitignore)...' : 'Loading files (ignoring common dirs)...' });

        let listCommand: string;

        if (useGit) {
          // Use git ls-files which respects .gitignore and outputs relative paths
          listCommand = `cd "${startPath}" && git ls-files 2>/dev/null`;
        } else {
          // Use find command with ignore patterns
          listCommand = buildFindCommandWithIgnores(startPath, 'f');
        }

        const result = await e2bClient.runCommand(listCommand, sandboxId);

        if (token.isCancellationRequested) return null;

        if (result.exitCode === 0 && result.stdout) {
          // Parse the output to build file list
          const filePaths = result.stdout.trim().split('\n').filter(line => line.length > 0);

          for (let i = 0; i < filePaths.length; i++) {
            if (token.isCancellationRequested) return null;

            let filePath = filePaths[i];

            // Git ls-files returns relative paths, convert to absolute
            if (useGit && !filePath.startsWith('/')) {
              filePath = startPath === '/' ? `/${filePath}` : `${startPath}/${filePath}`;
            }

            const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);

            files.push({ path: filePath, name: fileName });

            // Update progress every 100 files to avoid too many updates
            if (i % 100 === 0 || i === filePaths.length - 1) {
              if (hasTotals) {
                const percentage = Math.round(((i + 1) / totalFiles) * 100);
                progress.report({
                  increment: percentage,
                  message: `${i + 1} / ${totalFiles} files`
                });
              } else {
                progress.report({
                  message: `Processed ${i + 1} files`
                });
              }
            }
          }
        }
      } catch (error) {
        console.error('Error scanning files:', error);
        vscode.window.showErrorMessage(`Failed to scan files: ${error}`);
        return null;
      }

      // Final report
      progress.report({
        increment: 100,
        message: `Completed: ${files.length} files indexed`
      });

      // Save to cache if successful
      if (!token.isCancellationRequested && files.length > 0) {
        e2bClient.setFileIndexCache(sandboxId, startPath, files, useGit);
      }

      return token.isCancellationRequested ? null : files;
    });
  }

  // Handle cancellation
  if (allFiles === null) {
    vscode.window.showInformationMessage('File indexing cancelled');
    return;
  }

  if (allFiles.length === 0) {
    vscode.window.showInformationMessage('No files found in sandbox');
    return;
  }

  // Show quick pick with all files
  const items = allFiles.map(file => ({
    label: file.name,
    description: file.path,
    iconPath: vscode.ThemeIcon.File,
    resourceUri: vscode.Uri.parse(`e2b://${sandboxId}${file.path}`),
    path: file.path,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: `Search ${allFiles.length} files in ${startPath} (${sandboxId.substring(0, 12)}...)`,
    matchOnDescription: true,
  });

  if (selected) {
    const uri = vscode.Uri.parse(`e2b://${sandboxId}${selected.path}`);
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open file: ${error}`);
    }
  }
}

export async function searchSandboxesCommand(): Promise<void> {
  const searchText = await vscode.window.showInputBox({
    prompt: 'Search sandboxes by ID, name, or template',
    placeHolder: 'Enter search text...',
  });

  if (searchText === undefined) {
    // User cancelled
    return;
  }

  // Apply filter
  sandboxListProvider.setFilter(searchText);
}

export function clearSandboxFilterCommand(): void {
  sandboxListProvider.clearFilter();
}
