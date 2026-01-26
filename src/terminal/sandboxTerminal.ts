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
  private isReconnecting = false;

  constructor(private readonly sandboxId: string) {}

  async open(initialDimensions: vscode.TerminalDimensions | undefined): Promise<void> {
    if (initialDimensions) {
      this.currentDimensions = {
        cols: initialDimensions.columns,
        rows: initialDimensions.rows,
      };
    }

    if (!e2bClient.isConnectedToSandbox(this.sandboxId)) {
      this.writeEmitter.fire('\x1b[31mNot connected to sandbox\x1b[0m\r\n');
      this.closeEmitter.fire(1);
      return;
    }

    try {
      const sandbox = e2bClient.getSandbox(this.sandboxId);
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

  private async reconnect(): Promise<boolean> {
    if (this.isReconnecting) {
      return false;
    }

    this.isReconnecting = true;
    this.writeEmitter.fire('\r\n\x1b[33mTerminal connection lost. Reconnecting...\x1b[0m\r\n');

    try {
      // Clean up old PTY handle
      this.ptyHandle = null;

      // Check if still connected to sandbox
      if (!e2bClient.isConnectedToSandbox(this.sandboxId)) {
        this.writeEmitter.fire('\x1b[31mSandbox is no longer connected. Please reconnect to the sandbox.\x1b[0m\r\n');
        this.isReconnecting = false;
        return false;
      }

      const sandbox = e2bClient.getSandbox(this.sandboxId);
      if (!sandbox) {
        this.writeEmitter.fire('\x1b[31mSandbox not available. Please reconnect to the sandbox.\x1b[0m\r\n');
        this.isReconnecting = false;
        return false;
      }

      // Create new PTY session
      this.ptyHandle = await sandbox.pty.create({
        cols: this.currentDimensions.cols,
        rows: this.currentDimensions.rows,
        onData: (data: Uint8Array) => {
          const text = new TextDecoder().decode(data);
          this.writeEmitter.fire(text);
        },
      });

      this.writeEmitter.fire('\x1b[32mReconnected successfully!\x1b[0m\r\n');
      this.isReconnecting = false;
      return true;
    } catch (error) {
      this.writeEmitter.fire(`\x1b[31mReconnection failed: ${error}\x1b[0m\r\n`);
      this.isReconnecting = false;
      return false;
    }
  }

  async handleInput(data: string): Promise<void> {
    if (!this.ptyHandle) {
      return;
    }

    try {
      const sandbox = e2bClient.getSandbox(this.sandboxId);
      if (!sandbox) {
        return;
      }

      // Convert string to Uint8Array and send to PTY
      const encoder = new TextEncoder();
      const bytes = encoder.encode(data);
      await sandbox.pty.sendInput(this.ptyHandle.pid, bytes);
    } catch (error) {
      // Check if this is a "process not found" error indicating PTY is dead
      const errorStr = String(error);
      if (errorStr.includes('not_found') || errorStr.includes('NotFoundError')) {
        // Attempt to reconnect
        const reconnected = await this.reconnect();
        if (reconnected) {
          // Retry sending the input after successful reconnection
          try {
            const sandbox = e2bClient.getSandbox(this.sandboxId);
            if (sandbox && this.ptyHandle) {
              const encoder = new TextEncoder();
              const bytes = encoder.encode(data);
              await sandbox.pty.sendInput(this.ptyHandle.pid, bytes);
            }
          } catch (retryError) {
            this.writeEmitter.fire(`\x1b[31mError sending input after reconnection: ${retryError}\x1b[0m\r\n`);
          }
        }
      } else {
        this.writeEmitter.fire(`\x1b[31mError sending input: ${error}\x1b[0m\r\n`);
      }
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
      const sandbox = e2bClient.getSandbox(this.sandboxId);
      if (!sandbox) {
        return;
      }

      await sandbox.pty.resize(this.ptyHandle.pid, this.currentDimensions);
    } catch (error) {
      // Check if PTY is dead and attempt to reconnect
      const errorStr = String(error);
      if (errorStr.includes('not_found') || errorStr.includes('NotFoundError')) {
        await this.reconnect();
      }
      // Otherwise ignore resize errors
    }
  }
}

export function createSandboxTerminal(sandboxId: string): vscode.Terminal {
  const pty = new SandboxTerminal(sandboxId);
  const shortId = sandboxId.substring(0, 12);
  return vscode.window.createTerminal({
    name: `E2B: ${shortId}...`,
    pty,
    isTransient: false,
  });
}
