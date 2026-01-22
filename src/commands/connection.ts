import * as vscode from 'vscode';
import { e2bClient } from '../e2b/client';
import { sandboxListProvider, sandboxDecorationProvider, SandboxItem } from '../providers/sandboxListProvider';
import { fileTreeProvider } from '../providers/fileTreeProvider';
import { createSandboxTerminal } from '../terminal/sandboxTerminal';
import { setApiKeyCommand } from './apiKey';
import { updateConnectedContext } from './utils';

// Track terminals by sandbox ID
const sandboxTerminals = new Map<string, vscode.Terminal[]>();

export function getSandboxTerminals(): Map<string, vscode.Terminal[]> {
  return sandboxTerminals;
}

export async function connectCommand(item?: SandboxItem): Promise<void> {
  // Check for API key first
  if (!e2bClient.hasApiKey()) {
    await setApiKeyCommand();
    if (!e2bClient.hasApiKey()) {
      return;
    }
  }

  let sandboxId: string | undefined;

  if (item?.sandboxInfo) {
    sandboxId = item.sandboxInfo.sandboxId;
  } else {
    sandboxId = await vscode.window.showInputBox({
      prompt: 'Enter E2B Sandbox ID',
      placeHolder: 'sandbox-id-xxx',
      ignoreFocusOut: true,
    });
  }

  if (!sandboxId) {
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Connecting to sandbox ${sandboxId}...`,
      cancellable: false,
    },
    async () => {
      try {
        await e2bClient.connect(sandboxId!);
        updateConnectedContext();

        // Refresh to show "configuring" state (yellow/orange with loading icon)
        sandboxListProvider.refresh();
        sandboxDecorationProvider.refresh();

        // Prompt for directory path with default value
        const directoryPath = await vscode.window.showInputBox({
          prompt: 'Enter directory path to open',
          value: '/home/user',
          placeHolder: '/home/user',
          ignoreFocusOut: true,
          validateInput: (value) => {
            if (!value) {
              return 'Directory path cannot be empty';
            }
            if (!value.startsWith('/')) {
              return 'Directory path must start with /';
            }
            return null;
          }
        });

        // If user cancels the prompt, disconnect and return
        if (!directoryPath) {
          await e2bClient.disconnect(sandboxId!);
          updateConnectedContext();
          sandboxListProvider.refresh();
          sandboxDecorationProvider.refresh();
          return;
        }

        // Remove trailing slash if present (unless it's just "/")
        const normalizedPath = directoryPath === '/' ? '/' : directoryPath.replace(/\/$/, '');

        // Store the root path for this sandbox
        e2bClient.setRootPath(sandboxId!, normalizedPath);

        // Refresh providers to show the connected sandbox
        sandboxListProvider.refresh();
        sandboxDecorationProvider.refresh();
        fileTreeProvider.refresh();

        // Automatically open terminal for this sandbox
        const terminal = createSandboxTerminal(sandboxId!);

        // Track the terminal
        if (!sandboxTerminals.has(sandboxId!)) {
          sandboxTerminals.set(sandboxId!, []);
        }
        sandboxTerminals.get(sandboxId!)!.push(terminal);

        terminal.show();

        vscode.window.showInformationMessage(`Connected to sandbox: ${sandboxId}`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to connect: ${error}`);
        sandboxListProvider.refresh();
        sandboxDecorationProvider.refresh();
      }
    }
  );
}

export async function disconnectCommand(item?: any): Promise<void> {
  if (!e2bClient.isConnected) {
    vscode.window.showInformationMessage('Not connected to any sandbox');
    return;
  }

  // Get sandboxId from the item if provided (could be SandboxItem, SandboxRootItem, or FileItem)
  let sandboxId: string | undefined;
  if (item?.sandboxInfo?.sandboxId) {
    // SandboxItem from sandbox list
    sandboxId = item.sandboxInfo.sandboxId;
  } else if (item?.sandboxId) {
    // FileItem or SandboxRootItem
    sandboxId = item.sandboxId;
  }

  if (!sandboxId) {
    // If no specific sandbox, ask user or disconnect all
    const connectedIds = e2bClient.getConnectedSandboxIds();
    if (connectedIds.length === 1) {
      sandboxId = connectedIds[0];
    } else {
      const options = [
        ...connectedIds.map(id => ({ label: id, description: 'Disconnect this sandbox' })),
        { label: 'All', description: 'Disconnect all sandboxes' },
      ];
      const selected = await vscode.window.showQuickPick(options, {
        placeHolder: 'Select sandbox to disconnect',
      });
      if (!selected) {
        return;
      }
      sandboxId = selected.label === 'All' ? undefined : selected.label;
    }
  }

  // Close terminals before disconnecting
  if (sandboxId) {
    // Close terminals for specific sandbox
    const terminals = sandboxTerminals.get(sandboxId);
    if (terminals) {
      terminals.forEach(terminal => terminal.dispose());
      sandboxTerminals.delete(sandboxId);
    }
  } else {
    // Close all terminals
    for (const terminals of sandboxTerminals.values()) {
      terminals.forEach(terminal => terminal.dispose());
    }
    sandboxTerminals.clear();
  }

  await e2bClient.disconnect(sandboxId);
  updateConnectedContext();
  sandboxListProvider.refresh();
  sandboxDecorationProvider.refresh();
  fileTreeProvider.refresh();

  if (sandboxId) {
    vscode.window.showInformationMessage(`Disconnected from sandbox: ${sandboxId}`);
  } else {
    vscode.window.showInformationMessage('Disconnected from all sandboxes');
  }
}

export function setupTerminalTracking(context: vscode.ExtensionContext): void {
  // Track terminal closures to clean up our map
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((terminal) => {
      // Remove closed terminal from all sandbox terminal lists
      for (const [sandboxId, terminals] of sandboxTerminals.entries()) {
        const index = terminals.indexOf(terminal);
        if (index !== -1) {
          terminals.splice(index, 1);
          if (terminals.length === 0) {
            sandboxTerminals.delete(sandboxId);
          }
          break;
        }
      }
    })
  );
}
