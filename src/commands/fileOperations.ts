import * as vscode from 'vscode';
import * as path from 'path';
import { e2bClient } from '../e2b/client';
import { fileTreeProvider, FileItem } from '../providers/fileTreeProvider';

export async function openFileCommand(item?: FileItem): Promise<void> {
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

export async function newFileCommand(item?: FileItem): Promise<void> {
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

    // Invalidate file index cache for this directory
    e2bClient.invalidateFileIndexCache(sandboxId, dirPath);

    fileTreeProvider.refresh();

    // Open the new file
    const uri = vscode.Uri.parse(`e2b://${sandboxId}${filePath}`);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to create file: ${error}`);
  }
}

export async function newFolderCommand(item?: FileItem): Promise<void> {
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

    // Invalidate file index cache for this directory
    e2bClient.invalidateFileIndexCache(sandboxId, dirPath);

    fileTreeProvider.refresh();
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to create folder: ${error}`);
  }
}

export async function deleteItemCommand(item?: FileItem): Promise<void> {
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

    // Invalidate file index cache for this path
    e2bClient.invalidateFileIndexCache(item.sandboxId, item.fileInfo.path);

    fileTreeProvider.refresh();
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to delete: ${error}`);
  }
}

export async function renameItemCommand(item?: FileItem): Promise<void> {
  if (!item) {
    return;
  }

  const newName = await vscode.window.showInputBox({
    prompt: 'Enter new name',
    value: item.fileInfo.name,
    placeHolder: item.fileInfo.name,
    validateInput: (value) => {
      if (!value || value.trim() === '') {
        return 'Name cannot be empty';
      }
      if (value.includes('/')) {
        return 'Name cannot contain "/"';
      }
      return null;
    }
  });

  if (!newName || newName === item.fileInfo.name) {
    return;
  }

  const directory = item.fileInfo.path.substring(0, item.fileInfo.path.lastIndexOf('/')) || '/';
  const newPath = directory === '/' ? `/${newName}` : `${directory}/${newName}`;

  try {
    await e2bClient.rename(item.fileInfo.path, newPath, item.sandboxId);

    // Invalidate file index cache for both old and new paths
    e2bClient.invalidateFileIndexCache(item.sandboxId, item.fileInfo.path);
    e2bClient.invalidateFileIndexCache(item.sandboxId, newPath);

    fileTreeProvider.refresh();
    vscode.window.showInformationMessage(`Renamed to "${newName}"`);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to rename: ${error}`);
  }
}
