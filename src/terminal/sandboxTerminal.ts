import * as vscode from 'vscode';
import { e2bClient } from '../e2b/client';

export class SandboxTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  private closeEmitter = new vscode.EventEmitter<number>();

  onDidWrite = this.writeEmitter.event;
  onDidClose = this.closeEmitter.event;

  private inputBuffer = '';
  private currentDir = '/home/user';

  open(): void {
    this.writeEmitter.fire('\x1b[1;34mE2B Sandbox Terminal\x1b[0m\r\n');
    this.writeEmitter.fire(`Connected to sandbox: ${e2bClient.sandboxId}\r\n`);
    this.writeEmitter.fire('\r\n');
    this.showPrompt();
  }

  close(): void {
    // Cleanup if needed
  }

  handleInput(data: string): void {
    // Handle special characters
    if (data === '\r') {
      // Enter key
      this.writeEmitter.fire('\r\n');
      this.executeCommand(this.inputBuffer);
      this.inputBuffer = '';
    } else if (data === '\x7f') {
      // Backspace
      if (this.inputBuffer.length > 0) {
        this.inputBuffer = this.inputBuffer.slice(0, -1);
        this.writeEmitter.fire('\b \b');
      }
    } else if (data === '\x03') {
      // Ctrl+C
      this.writeEmitter.fire('^C\r\n');
      this.inputBuffer = '';
      this.showPrompt();
    } else if (data === '\x04') {
      // Ctrl+D
      this.closeEmitter.fire(0);
    } else {
      // Regular character
      this.inputBuffer += data;
      this.writeEmitter.fire(data);
    }
  }

  private showPrompt(): void {
    const sandboxId = e2bClient.sandboxId || 'sandbox';
    this.writeEmitter.fire(`\x1b[32m${sandboxId}\x1b[0m:\x1b[34m${this.currentDir}\x1b[0m$ `);
  }

  private async executeCommand(command: string): Promise<void> {
    const trimmed = command.trim();

    if (!trimmed) {
      this.showPrompt();
      return;
    }

    if (!e2bClient.isConnected) {
      this.writeEmitter.fire('\x1b[31mNot connected to sandbox\x1b[0m\r\n');
      this.showPrompt();
      return;
    }

    // Handle cd command locally
    if (trimmed.startsWith('cd ')) {
      const newDir = trimmed.slice(3).trim();
      await this.handleCd(newDir);
      return;
    }

    if (trimmed === 'cd') {
      this.currentDir = '/home/user';
      this.showPrompt();
      return;
    }

    // Handle exit command
    if (trimmed === 'exit') {
      this.closeEmitter.fire(0);
      return;
    }

    try {
      // Execute command in current directory
      const fullCommand = `cd "${this.currentDir}" && ${trimmed}`;
      const result = await e2bClient.runCommand(fullCommand);

      if (result.stdout) {
        // Convert newlines for terminal
        const output = result.stdout.replace(/\n/g, '\r\n');
        this.writeEmitter.fire(output);
        if (!output.endsWith('\r\n')) {
          this.writeEmitter.fire('\r\n');
        }
      }

      if (result.stderr) {
        const errOutput = result.stderr.replace(/\n/g, '\r\n');
        this.writeEmitter.fire(`\x1b[31m${errOutput}\x1b[0m`);
        if (!errOutput.endsWith('\r\n')) {
          this.writeEmitter.fire('\r\n');
        }
      }
    } catch (error) {
      this.writeEmitter.fire(`\x1b[31mError: ${error}\x1b[0m\r\n`);
    }

    this.showPrompt();
  }

  private async handleCd(newDir: string): Promise<void> {
    try {
      // Resolve path
      let targetDir: string;
      if (newDir.startsWith('/')) {
        targetDir = newDir;
      } else if (newDir === '~') {
        targetDir = '/home/user';
      } else if (newDir.startsWith('~/')) {
        targetDir = '/home/user' + newDir.slice(1);
      } else {
        targetDir = this.currentDir === '/'
          ? '/' + newDir
          : this.currentDir + '/' + newDir;
      }

      // Normalize path
      const result = await e2bClient.runCommand(`cd "${targetDir}" && pwd`);
      if (result.exitCode === 0) {
        this.currentDir = result.stdout.trim();
      } else {
        this.writeEmitter.fire(`\x1b[31mcd: ${newDir}: No such directory\x1b[0m\r\n`);
      }
    } catch (error) {
      this.writeEmitter.fire(`\x1b[31mcd: ${newDir}: No such directory\x1b[0m\r\n`);
    }
    this.showPrompt();
  }
}

export function createSandboxTerminal(): vscode.Terminal {
  const pty = new SandboxTerminal();
  return vscode.window.createTerminal({
    name: `E2B: ${e2bClient.sandboxId || 'Sandbox'}`,
    pty,
  });
}
