import * as vscode from 'vscode';
import { e2bClient } from '../e2b/client';
import { createSandboxTerminal } from '../terminal/sandboxTerminal';
import { getSandboxTerminals } from './connection';

export async function openTerminalCommand(item?: any): Promise<void> {
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
  const sandboxTerminals = getSandboxTerminals();
  if (!sandboxTerminals.has(sandboxId)) {
    sandboxTerminals.set(sandboxId, []);
  }
  sandboxTerminals.get(sandboxId)!.push(terminal);

  terminal.show();
}
