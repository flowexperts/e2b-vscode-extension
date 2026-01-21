import * as vscode from 'vscode';
import { e2bClient, FileInfo } from '../e2b/client';

export class FileItem extends vscode.TreeItem {
  constructor(
    public readonly fileInfo: FileInfo,
  ) {
    super(
      fileInfo.name,
      fileInfo.isDir
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    this.tooltip = fileInfo.path;
    this.resourceUri = vscode.Uri.parse(`e2b://${e2bClient.sandboxId}${fileInfo.path}`);

    if (fileInfo.isDir) {
      this.contextValue = 'directory';
      this.iconPath = vscode.ThemeIcon.Folder;
    } else {
      this.contextValue = 'file';
      this.iconPath = vscode.ThemeIcon.File;
      this.command = {
        command: 'e2b.openFile',
        title: 'Open File',
        arguments: [this],
      };
    }
  }
}

export class FileTreeProvider implements vscode.TreeDataProvider<FileItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FileItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: FileItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: FileItem): Promise<FileItem[]> {
    if (!e2bClient.isConnected) {
      return [];
    }

    try {
      const dirPath = element ? element.fileInfo.path : '/';
      const files = await e2bClient.listFiles(dirPath);

      return files
        .sort((a, b) => {
          if (a.isDir !== b.isDir) {
            return a.isDir ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        })
        .map(file => new FileItem(file));
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to list files: ${error}`);
      return [];
    }
  }
}

export const fileTreeProvider = new FileTreeProvider();
