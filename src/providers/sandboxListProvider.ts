import * as vscode from 'vscode';
import { e2bClient, SandboxInfo } from '../e2b/client';

export class SandboxItem extends vscode.TreeItem {
  constructor(
    public readonly sandboxInfo: SandboxInfo,
    public readonly isConnected: boolean,
  ) {
    super(
      sandboxInfo.name || sandboxInfo.sandboxId,
      vscode.TreeItemCollapsibleState.None
    );

    this.description = sandboxInfo.templateId || '';
    this.tooltip = `Sandbox: ${sandboxInfo.sandboxId}\nTemplate: ${sandboxInfo.templateId || 'N/A'}\nStarted: ${sandboxInfo.startedAt || 'N/A'}\nStatus: ${isConnected ? 'Connected' : 'Disconnected'}`;
    this.contextValue = isConnected ? 'sandboxConnected' : 'sandbox';

    if (isConnected) {
      // Use a check icon with green color to clearly indicate connection
      this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
      this.description = `${this.description} • Connected`;
    } else {
      this.iconPath = new vscode.ThemeIcon('vm-outline');
    }
  }
}

export class SandboxListProvider implements vscode.TreeDataProvider<SandboxItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SandboxItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private sandboxes: SandboxInfo[] = [];
  private filterText: string = '';

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setFilter(text: string): void {
    this.filterText = text.toLowerCase();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SandboxItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<SandboxItem[]> {
    if (!e2bClient.hasApiKey()) {
      return [];
    }

    try {
      this.sandboxes = await e2bClient.listSandboxes();

      let filtered = this.sandboxes;
      if (this.filterText) {
        filtered = this.sandboxes.filter(s =>
          s.sandboxId.toLowerCase().includes(this.filterText) ||
          s.name?.toLowerCase().includes(this.filterText) ||
          s.templateId?.toLowerCase().includes(this.filterText)
        );
      }

      return filtered.map(sandbox => new SandboxItem(
        sandbox,
        e2bClient.isConnectedToSandbox(sandbox.sandboxId)
      ));
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to list sandboxes: ${error}`);
      return [];
    }
  }
}

export const sandboxListProvider = new SandboxListProvider();
