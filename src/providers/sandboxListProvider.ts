import * as vscode from 'vscode';
import { e2bClient, SandboxInfo } from '../e2b/client';

export class SandboxItem extends vscode.TreeItem {
  constructor(
    public readonly sandboxInfo: SandboxInfo,
    public readonly connectionState: 'disconnected' | 'configuring' | 'connected',
  ) {
    super(
      sandboxInfo.name || sandboxInfo.sandboxId,
      vscode.TreeItemCollapsibleState.None
    );

    this.description = sandboxInfo.sandboxId

    let statusText: string;
    if (connectionState === 'connected') {
      statusText = 'Connected';
    } else if (connectionState === 'configuring') {
      statusText = 'Configuring...';
    } else {
      statusText = 'Disconnected';
    }

    this.tooltip = `Sandbox: ${sandboxInfo.sandboxId}\nTemplate: ${sandboxInfo.templateId || 'N/A'}\nStarted: ${sandboxInfo.startedAt || 'N/A'}\nStatus: ${statusText}`;
    this.contextValue = connectionState === 'connected' ? 'sandboxConnected' : 'sandbox';

    // Set resourceUri to enable file decorations for coloring
    this.resourceUri = vscode.Uri.parse(`e2b-sandbox:${sandboxInfo.sandboxId}`);

    if (connectionState === 'connected') {
      // Use a check icon with green color to clearly indicate full connection
      this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
    } else if (connectionState === 'configuring') {
      // Use a loading icon with yellow/orange color to indicate configuration in progress
      this.iconPath = new vscode.ThemeIcon('loading~spin', new vscode.ThemeColor('list.warningForeground'));
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
    this.updateFilterContext();
  }

  clearFilter(): void {
    this.filterText = '';
    this._onDidChangeTreeData.fire();
    this.updateFilterContext();
  }

  isFiltered(): boolean {
    return this.filterText.length > 0;
  }

  private updateFilterContext(): void {
    vscode.commands.executeCommand('setContext', 'e2b.sandboxListFiltered', this.isFiltered());
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

      return filtered.map(sandbox => {
        let connectionState: 'disconnected' | 'configuring' | 'connected';
        if (e2bClient.isFullyConfigured(sandbox.sandboxId)) {
          connectionState = 'connected';
        } else if (e2bClient.isConnectedToSandbox(sandbox.sandboxId)) {
          connectionState = 'configuring';
        } else {
          connectionState = 'disconnected';
        }
        return new SandboxItem(sandbox, connectionState);
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to list sandboxes: ${error}`);
      return [];
    }
  }
}

export const sandboxListProvider = new SandboxListProvider();

// Decoration provider to color connected sandboxes green
export class SandboxDecorationProvider implements vscode.FileDecorationProvider {
  private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  refresh(): void {
    // Fire undefined to refresh all decorations
    this._onDidChangeFileDecorations.fire(undefined);
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme === 'e2b-sandbox') {
      // The sandbox ID is in the path after the scheme
      const sandboxId = uri.path;

      if (e2bClient.isFullyConfigured(sandboxId)) {
        // Fully connected - green color with badge
        return {
          color: new vscode.ThemeColor('charts.green'),
          badge: '●',
        };
      } else if (e2bClient.isConnectedToSandbox(sandboxId)) {
        // Configuring - yellow/orange color with badge
        return {
          color: new vscode.ThemeColor('charts.yellow'),
          badge: '●',
        };
      }
    }
    return undefined;
  }
}

export const sandboxDecorationProvider = new SandboxDecorationProvider();
