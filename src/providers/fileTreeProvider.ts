import * as vscode from 'vscode';
import { e2bClient, FileInfo } from '../e2b/client';

export class SandboxRootItem extends vscode.TreeItem {
  constructor(
    public readonly sandboxId: string,
  ) {
    super(
      `Sandbox: ${sandboxId.substring(0, 12)}...`,
      vscode.TreeItemCollapsibleState.Expanded
    );

    this.tooltip = `Connected to sandbox: ${sandboxId}`;
    this.contextValue = 'sandboxRoot';
    this.iconPath = new vscode.ThemeIcon('cloud', new vscode.ThemeColor('charts.green'));
  }
}

export class FileItem extends vscode.TreeItem {
  constructor(
    public readonly fileInfo: FileInfo,
    public readonly sandboxId: string,
  ) {
    super(
      fileInfo.name,
      fileInfo.isDir
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    this.tooltip = fileInfo.path;
    this.resourceUri = vscode.Uri.parse(`e2b://${sandboxId}${fileInfo.path}`);

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

type TreeItem = SandboxRootItem | FileItem;

export class FileTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    if (!e2bClient.isConnected) {
      return [];
    }

    try {
      // Root level: show all connected sandboxes
      if (!element) {
        const sandboxIds = e2bClient.getConnectedSandboxIds();
        return sandboxIds.map(id => new SandboxRootItem(id));
      }

      // Second level: show files for each sandbox
      if (element instanceof SandboxRootItem) {
        const files = await e2bClient.listFiles('/', element.sandboxId);
        return files
          .sort((a, b) => {
            if (a.isDir !== b.isDir) {
              return a.isDir ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          })
          .map(file => new FileItem(file, element.sandboxId));
      }

      // Deeper levels: show files/folders within a directory
      if (element instanceof FileItem) {
        const files = await e2bClient.listFiles(element.fileInfo.path, element.sandboxId);
        return files
          .sort((a, b) => {
            if (a.isDir !== b.isDir) {
              return a.isDir ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          })
          .map(file => new FileItem(file, element.sandboxId));
      }

      return [];
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to list files: ${error}`);
      return [];
    }
  }
}

export const fileTreeProvider = new FileTreeProvider();
