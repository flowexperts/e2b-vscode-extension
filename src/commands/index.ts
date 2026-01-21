import * as vscode from 'vscode';
import { e2bClient } from '../e2b/client';
import { sandboxListProvider, SandboxItem } from '../providers/sandboxListProvider';
import { fileTreeProvider, FileItem } from '../providers/fileTreeProvider';
import { createSandboxTerminal } from '../terminal/sandboxTerminal';
import * as path from 'path';

// Track terminals by sandbox ID
const sandboxTerminals = new Map<string, vscode.Terminal[]>();

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('e2b.setApiKey', setApiKeyCommand),
    vscode.commands.registerCommand('e2b.refresh', refreshCommand),
    vscode.commands.registerCommand('e2b.connect', connectCommand),
    vscode.commands.registerCommand('e2b.disconnect', disconnectCommand),
    vscode.commands.registerCommand('e2b.openTerminal', openTerminalCommand),
    vscode.commands.registerCommand('e2b.openFile', openFileCommand),
    vscode.commands.registerCommand('e2b.newFile', newFileCommand),
    vscode.commands.registerCommand('e2b.newFolder', newFolderCommand),
    vscode.commands.registerCommand('e2b.deleteItem', deleteItemCommand),
    vscode.commands.registerCommand('e2b.searchFiles', searchFilesCommand),
  );

  // Track terminal closures to clean up our map
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((terminal) => {
      // Remove closed terminal from all sandbox terminal lists
      for (const [sandboxId, terminals] of sandboxTerminals.entries()) {
        const index = terminals.indexOf(terminal);
        if (index !== -1) {
          terminals.splice(index, 1);
          if (terminals.length === 0) {
            sandboxTerminals.delete(sandboxId);
          }
          break;
        }
      }
    })
  );

  // Update context for API key status
  updateApiKeyContext();
}

function updateApiKeyContext(): void {
  vscode.commands.executeCommand('setContext', 'e2b.hasApiKey', e2bClient.hasApiKey());
}

function updateConnectedContext(): void {
  vscode.commands.executeCommand('setContext', 'e2b.connected', e2bClient.isConnected);
}

async function setApiKeyCommand(): Promise<void> {
  const apiKey = await vscode.window.showInputBox({
    prompt: 'Enter your E2B API Key',
    placeHolder: 'e2b_xxx...',
    ignoreFocusOut: true,
    password: true,
  });

  if (!apiKey) {
    return;
  }

  await e2bClient.setApiKey(apiKey);
  updateApiKeyContext();
  vscode.window.showInformationMessage('E2B API key saved');
  sandboxListProvider.refresh();
}

function refreshCommand(): void {
  sandboxListProvider.refresh();
  if (e2bClient.isConnected) {
    fileTreeProvider.refresh();
  }
}

async function connectCommand(item?: SandboxItem): Promise<void> {
  // Check for API key first
  if (!e2bClient.hasApiKey()) {
    await setApiKeyCommand();
    if (!e2bClient.hasApiKey()) {
      return;
    }
  }

  let sandboxId: string | undefined;

  if (item?.sandboxInfo) {
    sandboxId = item.sandboxInfo.sandboxId;
  } else {
    sandboxId = await vscode.window.showInputBox({
      prompt: 'Enter E2B Sandbox ID',
      placeHolder: 'sandbox-id-xxx',
      ignoreFocusOut: true,
    });
  }

  if (!sandboxId) {
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Connecting to sandbox ${sandboxId}...`,
      cancellable: false,
    },
    async () => {
      try {
        await e2bClient.connect(sandboxId!);
        updateConnectedContext();

        // Add sandbox as a workspace folder BEFORE refreshing providers
        // This ensures VSCode has initialized the workspace folder before UI tries to populate
        const sandboxUri = vscode.Uri.parse(`e2b://${sandboxId}/`);
        const workspaceFolderIndex = (vscode.workspace.workspaceFolders?.length || 0);
        const sandboxName = `E2B: ${sandboxId.substring(0, 12)}...`;

        vscode.workspace.updateWorkspaceFolders(
          workspaceFolderIndex,
          0,
          { uri: sandboxUri, name: sandboxName }
        );

        // Small delay to allow VSCode to fully initialize the workspace folder
        // This is especially important for the first connection
        await new Promise(resolve => setTimeout(resolve, 100));

        // Now refresh providers - workspace folder is ready
        sandboxListProvider.refresh();
        fileTreeProvider.refresh();

        // Automatically open terminal for this sandbox
        const terminal = createSandboxTerminal(sandboxId!);

        // Track the terminal
        if (!sandboxTerminals.has(sandboxId!)) {
          sandboxTerminals.set(sandboxId!, []);
        }
        sandboxTerminals.get(sandboxId!)!.push(terminal);

        terminal.show();

        vscode.window.showInformationMessage(`Connected to sandbox: ${sandboxId}`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to connect: ${error}`);
      }
    }
  );
}

async function disconnectCommand(item?: any): Promise<void> {
  if (!e2bClient.isConnected) {
    vscode.window.showInformationMessage('Not connected to any sandbox');
    return;
  }

  // Get sandboxId from the item if provided (could be SandboxItem, SandboxRootItem, or FileItem)
  let sandboxId: string | undefined;
  if (item?.sandboxInfo?.sandboxId) {
    // SandboxItem from sandbox list
    sandboxId = item.sandboxInfo.sandboxId;
  } else if (item?.sandboxId) {
    // FileItem or SandboxRootItem
    sandboxId = item.sandboxId;
  }

  if (!sandboxId) {
    // If no specific sandbox, ask user or disconnect all
    const connectedIds = e2bClient.getConnectedSandboxIds();
    if (connectedIds.length === 1) {
      sandboxId = connectedIds[0];
    } else {
      const options = [
        ...connectedIds.map(id => ({ label: id, description: 'Disconnect this sandbox' })),
        { label: 'All', description: 'Disconnect all sandboxes' },
      ];
      const selected = await vscode.window.showQuickPick(options, {
        placeHolder: 'Select sandbox to disconnect',
      });
      if (!selected) {
        return;
      }
      sandboxId = selected.label === 'All' ? undefined : selected.label;
    }
  }

  // Close terminals before disconnecting
  if (sandboxId) {
    // Close terminals for specific sandbox
    const terminals = sandboxTerminals.get(sandboxId);
    if (terminals) {
      terminals.forEach(terminal => terminal.dispose());
      sandboxTerminals.delete(sandboxId);
    }
  } else {
    // Close all terminals
    for (const [id, terminals] of sandboxTerminals.entries()) {
      terminals.forEach(terminal => terminal.dispose());
    }
    sandboxTerminals.clear();
  }

  // Remove workspace folder(s) before disconnecting
  const workspaceFolders = vscode.workspace.workspaceFolders || [];
  if (sandboxId) {
    // Remove specific sandbox workspace folder
    const folderIndex = workspaceFolders.findIndex(
      folder => folder.uri.scheme === 'e2b' && folder.uri.authority === sandboxId
    );
    if (folderIndex !== -1) {
      vscode.workspace.updateWorkspaceFolders(folderIndex, 1);
    }
  } else {
    // Remove all E2B workspace folders
    const e2bFolders = workspaceFolders
      .map((folder, index) => ({ folder, index }))
      .filter(({ folder }) => folder.uri.scheme === 'e2b')
      .reverse(); // Remove from end to start to maintain indices

    for (const { index } of e2bFolders) {
      vscode.workspace.updateWorkspaceFolders(index, 1);
    }
  }

  await e2bClient.disconnect(sandboxId);
  updateConnectedContext();
  sandboxListProvider.refresh();
  fileTreeProvider.refresh();

  if (sandboxId) {
    vscode.window.showInformationMessage(`Disconnected from sandbox: ${sandboxId}`);
  } else {
    vscode.window.showInformationMessage('Disconnected from all sandboxes');
  }
}

async function openTerminalCommand(item?: any): Promise<void> {
  if (!e2bClient.isConnected) {
    vscode.window.showErrorMessage('Not connected to any sandbox');
    return;
  }

  // Get sandboxId from item or ask user to select
  let sandboxId: string;
  if (item?.sandboxId) {
    sandboxId = item.sandboxId;
  } else {
    const connectedIds = e2bClient.getConnectedSandboxIds();
    if (connectedIds.length === 0) {
      vscode.window.showErrorMessage('Not connected to any sandbox');
      return;
    }
    if (connectedIds.length === 1) {
      sandboxId = connectedIds[0];
    } else {
      const selected = await vscode.window.showQuickPick(connectedIds, {
        placeHolder: 'Select sandbox to open terminal for',
      });
      if (!selected) {
        return;
      }
      sandboxId = selected;
    }
  }

  const terminal = createSandboxTerminal(sandboxId);

  // Track the terminal
  if (!sandboxTerminals.has(sandboxId)) {
    sandboxTerminals.set(sandboxId, []);
  }
  sandboxTerminals.get(sandboxId)!.push(terminal);

  terminal.show();
}

async function openFileCommand(item?: FileItem): Promise<void> {
  if (!item || item.fileInfo.isDir) {
    return;
  }

  // Use the sandboxId from the FileItem
  const uri = vscode.Uri.parse(`e2b://${item.sandboxId}${item.fileInfo.path}`);
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to open file: ${error}`);
  }
}

async function newFileCommand(item?: FileItem): Promise<void> {
  if (!e2bClient.isConnected) {
    vscode.window.showErrorMessage('Not connected to any sandbox');
    return;
  }

  // Get sandboxId from item or ask user to select
  let sandboxId: string;
  if (item?.sandboxId) {
    sandboxId = item.sandboxId;
  } else {
    const connectedIds = e2bClient.getConnectedSandboxIds();
    if (connectedIds.length === 0) {
      vscode.window.showErrorMessage('Not connected to any sandbox');
      return;
    }
    if (connectedIds.length === 1) {
      sandboxId = connectedIds[0];
    } else {
      const selected = await vscode.window.showQuickPick(connectedIds, {
        placeHolder: 'Select sandbox to create file in',
      });
      if (!selected) {
        return;
      }
      sandboxId = selected;
    }
  }

  const dirPath = item?.fileInfo.path || '/';

  const fileName = await vscode.window.showInputBox({
    prompt: 'Enter file name',
    placeHolder: 'newfile.txt',
  });

  if (!fileName) {
    return;
  }

  const filePath = path.posix.join(dirPath, fileName);

  try {
    await e2bClient.writeFile(filePath, '', sandboxId);
    fileTreeProvider.refresh();

    // Open the new file
    const uri = vscode.Uri.parse(`e2b://${sandboxId}${filePath}`);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to create file: ${error}`);
  }
}

async function newFolderCommand(item?: FileItem): Promise<void> {
  if (!e2bClient.isConnected) {
    vscode.window.showErrorMessage('Not connected to any sandbox');
    return;
  }

  // Get sandboxId from item or ask user to select
  let sandboxId: string;
  if (item?.sandboxId) {
    sandboxId = item.sandboxId;
  } else {
    const connectedIds = e2bClient.getConnectedSandboxIds();
    if (connectedIds.length === 0) {
      vscode.window.showErrorMessage('Not connected to any sandbox');
      return;
    }
    if (connectedIds.length === 1) {
      sandboxId = connectedIds[0];
    } else {
      const selected = await vscode.window.showQuickPick(connectedIds, {
        placeHolder: 'Select sandbox to create folder in',
      });
      if (!selected) {
        return;
      }
      sandboxId = selected;
    }
  }

  const dirPath = item?.fileInfo.path || '/';

  const folderName = await vscode.window.showInputBox({
    prompt: 'Enter folder name',
    placeHolder: 'newfolder',
  });

  if (!folderName) {
    return;
  }

  const folderPath = path.posix.join(dirPath, folderName);

  try {
    await e2bClient.makeDirectory(folderPath, sandboxId);
    fileTreeProvider.refresh();
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to create folder: ${error}`);
  }
}

async function deleteItemCommand(item?: FileItem): Promise<void> {
  if (!item) {
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Delete "${item.fileInfo.name}"?`,
    { modal: true },
    'Delete'
  );

  if (confirm !== 'Delete') {
    return;
  }

  try {
    await e2bClient.deleteFile(item.fileInfo.path, item.sandboxId);
    fileTreeProvider.refresh();
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to delete: ${error}`);
  }
}

async function searchFilesCommand(): Promise<void> {
  if (!e2bClient.isConnected) {
    vscode.window.showErrorMessage('Not connected to any sandbox');
    return;
  }

  // Get sandboxId - if multiple, ask user to select
  const connectedIds = e2bClient.getConnectedSandboxIds();
  if (connectedIds.length === 0) {
    vscode.window.showErrorMessage('Not connected to any sandbox');
    return;
  }

  let sandboxId: string;
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

  // Show progress while indexing files
  const allFiles = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Indexing sandbox files...',
      cancellable: false,
    },
    async () => {
      const files: Array<{ path: string; name: string }> = [];

      const scanDirectory = async (dirPath: string): Promise<void> => {
        try {
          const entries = await e2bClient.listFiles(dirPath, sandboxId);

          for (const entry of entries) {
            const fullPath = dirPath === '/' ? `/${entry.name}` : `${dirPath}/${entry.name}`;

            if (entry.isDir) {
              await scanDirectory(fullPath);
            } else {
              files.push({ path: fullPath, name: entry.name });
            }
          }
        } catch (error) {
          console.error(`Error scanning directory ${dirPath}:`, error);
        }
      };

      await scanDirectory('/');
      return files;
    }
  );

  if (allFiles.length === 0) {
    vscode.window.showInformationMessage('No files found in sandbox');
    return;
  }

  // Show quick pick with all files
  const items = allFiles.map(file => ({
    label: file.name,
    description: file.path,
    path: file.path,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: `Search ${allFiles.length} files in sandbox ${sandboxId.substring(0, 12)}...`,
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
