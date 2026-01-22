import * as vscode from 'vscode';
import { setApiKeyCommand } from './apiKey';
import { updateApiKeyContext, refreshCommand } from './utils';
import { connectCommand, disconnectCommand, setupTerminalTracking } from './connection';
import { openTerminalCommand } from './terminal';
import { openFileCommand, newFileCommand, newFolderCommand, deleteItemCommand, renameItemCommand } from './fileOperations';
import { searchFilesCommand, searchSandboxesCommand, clearSandboxFilterCommand } from './search';
import { copySandboxIdCommand, copyTemplateIdCommand } from './clipboard';

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('e2b.setApiKey', setApiKeyCommand),
    vscode.commands.registerCommand('e2b.refresh', refreshCommand),
    vscode.commands.registerCommand('e2b.connect', connectCommand),
    vscode.commands.registerCommand('e2b.disconnect', disconnectCommand),
    vscode.commands.registerCommand('e2b.openTerminal', openTerminalCommand),
    vscode.commands.registerCommand('e2b.openFile', openFileCommand),
    vscode.commands.registerCommand('e2b.newFile', newFileCommand),
    vscode.commands.registerCommand('e2b.newFolder', newFolderCommand),
    vscode.commands.registerCommand('e2b.deleteItem', deleteItemCommand),
    vscode.commands.registerCommand('e2b.renameItem', renameItemCommand),
    vscode.commands.registerCommand('e2b.searchFiles', searchFilesCommand),
    vscode.commands.registerCommand('e2b.searchSandboxes', searchSandboxesCommand),
    vscode.commands.registerCommand('e2b.clearSandboxFilter', clearSandboxFilterCommand),
    vscode.commands.registerCommand('e2b.copySandboxId', copySandboxIdCommand),
    vscode.commands.registerCommand('e2b.copyTemplateId', copyTemplateIdCommand),
  );

  // Setup terminal tracking
  setupTerminalTracking(context);

  // Update context for API key status
  updateApiKeyContext();
}
