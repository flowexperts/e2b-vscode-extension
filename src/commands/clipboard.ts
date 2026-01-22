import * as vscode from 'vscode';
import { SandboxItem } from '../providers/sandboxListProvider';

export async function copySandboxIdCommand(item: SandboxItem): Promise<void> {
  if (!item || !item.sandboxInfo) {
    vscode.window.showErrorMessage('No sandbox selected');
    return;
  }

  const sandboxId = item.sandboxInfo.sandboxId;
  await vscode.env.clipboard.writeText(sandboxId);
  vscode.window.showInformationMessage(`Copied sandbox ID: ${sandboxId}`);
}

export async function copyTemplateIdCommand(item: SandboxItem): Promise<void> {
  if (!item || !item.sandboxInfo) {
    vscode.window.showErrorMessage('No sandbox selected');
    return;
  }

  const templateAlias = item.sandboxInfo.templateId;
  if (!templateAlias) {
    vscode.window.showWarningMessage('This sandbox has no template alias');
    return;
  }

  await vscode.env.clipboard.writeText(templateAlias);
  vscode.window.showInformationMessage(`Copied template alias: ${templateAlias}`);
}
