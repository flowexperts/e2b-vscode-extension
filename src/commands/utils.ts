import * as vscode from 'vscode';
import { e2bClient } from '../e2b/client';
import { sandboxListProvider, sandboxDecorationProvider } from '../providers/sandboxListProvider';
import { fileTreeProvider } from '../providers/fileTreeProvider';

export function updateApiKeyContext(): void {
  vscode.commands.executeCommand('setContext', 'e2b.hasApiKey', e2bClient.hasApiKey());
}

export function updateConnectedContext(): void {
  vscode.commands.executeCommand('setContext', 'e2b.connected', e2bClient.isConnected);
}

export function refreshCommand(): void {
  sandboxListProvider.refresh();
  sandboxDecorationProvider.refresh();
  if (e2bClient.isConnected) {
    fileTreeProvider.refresh();
  }
}
