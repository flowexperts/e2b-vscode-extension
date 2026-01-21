import * as vscode from 'vscode';
import { e2bClient } from '../e2b/client';
import { sandboxListProvider, SandboxItem } from '../providers/sandboxListProvider';
import { fileTreeProvider, FileItem } from '../providers/fileTreeProvider';
import { createSandboxTerminal } from '../terminal/sandboxTerminal';
import * as path from 'path';

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
        sandboxListProvider.refresh();
        fileTreeProvider.refresh();

        // Automatically open terminal for this sandbox
        const terminal = createSandboxTerminal(sandboxId!);
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

  // Get sandboxId from the item if provided (could be SandboxRootItem or FileItem)
  let sandboxId: string | undefined;
  if (item?.sandboxId) {
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
