import * as vscode from 'vscode';
import { e2bClient } from '../e2b/client';
import type { CommandHandle } from 'e2b';

export class SandboxTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  private closeEmitter = new vscode.EventEmitter<number>();
  private setDimensionsEmitter = new vscode.EventEmitter<vscode.TerminalDimensions>();

  onDidWrite = this.writeEmitter.event;
  onDidClose = this.closeEmitter.event;
  onDidChangeDimensions = this.setDimensionsEmitter.event;

  private ptyHandle: CommandHandle | null = null;
  private currentDimensions = { cols: 80, rows: 24 };

  async open(initialDimensions: vscode.TerminalDimensions | undefined): Promise<void> {
    if (initialDimensions) {
      this.currentDimensions = {
        cols: initialDimensions.columns,
        rows: initialDimensions.rows,
      };
    }

    if (!e2bClient.isConnected) {
      this.writeEmitter.fire('\x1b[31mNot connected to sandbox\x1b[0m\r\n');
      this.closeEmitter.fire(1);
      return;
    }

    try {
      const sandbox = e2bClient.getSandbox();
      if (!sandbox) {
        this.writeEmitter.fire('\x1b[31mSandbox not available\x1b[0m\r\n');
        this.closeEmitter.fire(1);
        return;
      }

      // Create PTY with bash shell
      this.ptyHandle = await sandbox.pty.create({
        cols: this.currentDimensions.cols,
        rows: this.currentDimensions.rows,
        onData: (data: Uint8Array) => {
          // Convert binary data to string and send to terminal
          const text = new TextDecoder().decode(data);
          this.writeEmitter.fire(text);
        },
      });
    } catch (error) {
      this.writeEmitter.fire(`\x1b[31mFailed to create PTY: ${error}\x1b[0m\r\n`);
      this.closeEmitter.fire(1);
    }
  }

  async close(): Promise<void> {
    if (this.ptyHandle) {
      try {
        await this.ptyHandle.kill();
      } catch (error) {
        // Ignore errors on close
      }
      this.ptyHandle = null;
    }
  }

  async handleInput(data: string): Promise<void> {
    if (!this.ptyHandle) {
      return;
    }

    try {
      const sandbox = e2bClient.getSandbox();
      if (!sandbox) {
        return;
      }

      // Convert string to Uint8Array and send to PTY
      const encoder = new TextEncoder();
      const bytes = encoder.encode(data);
      await sandbox.pty.sendInput(this.ptyHandle.pid, bytes);
    } catch (error) {
      this.writeEmitter.fire(`\x1b[31mError sending input: ${error}\x1b[0m\r\n`);
    }
  }

  async setDimensions(dimensions: vscode.TerminalDimensions): Promise<void> {
    this.currentDimensions = {
      cols: dimensions.columns,
      rows: dimensions.rows,
    };

    if (!this.ptyHandle) {
      return;
    }

    try {
      const sandbox = e2bClient.getSandbox();
      if (!sandbox) {
        return;
      }

      await sandbox.pty.resize(this.ptyHandle.pid, this.currentDimensions);
    } catch (error) {
      // Ignore resize errors
    }
  }
}

export function createSandboxTerminal(): vscode.Terminal {
  const pty = new SandboxTerminal();
  return vscode.window.createTerminal({
    name: `E2B: ${e2bClient.sandboxId || 'Sandbox'}`,
    pty,
    isTransient: false,
  });
}
