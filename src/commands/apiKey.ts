import * as vscode from 'vscode';
import { e2bClient } from '../e2b/client';
import { sandboxListProvider } from '../providers/sandboxListProvider';
import { updateApiKeyContext } from './utils';

export async function setApiKeyCommand(): Promise<void> {
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
