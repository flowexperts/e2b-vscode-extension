import * as vscode from 'vscode';
import { e2bFileSystemProvider } from './providers/fileSystemProvider';
import { sandboxListProvider } from './providers/sandboxListProvider';
import { fileTreeProvider } from './providers/fileTreeProvider';
import { registerCommands } from './commands';
import { e2bClient } from './e2b/client';

export function activate(context: vscode.ExtensionContext): void {
  console.log('E2B Sandbox Explorer is now active');

  // Register the file system provider for the e2b:// scheme
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider('e2b', e2bFileSystemProvider, {
      isCaseSensitive: true,
      isReadonly: false,
    })
  );

  // Register the sandbox list tree view
  const sandboxListView = vscode.window.createTreeView('e2bSandboxes', {
    treeDataProvider: sandboxListProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(sandboxListView);

  // Register the file tree view
  const fileTreeView = vscode.window.createTreeView('e2bFiles', {
    treeDataProvider: fileTreeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(fileTreeView);

  // Register commands
  registerCommands(context);

  // Set initial context
  vscode.commands.executeCommand('setContext', 'e2b.hasApiKey', e2bClient.hasApiKey());
  vscode.commands.executeCommand('setContext', 'e2b.connected', false);
  vscode.commands.executeCommand('setContext', 'e2b.sandboxListFiltered', false);
}

export function deactivate(): void {
  console.log('E2B Sandbox Explorer is now deactivated');
}
