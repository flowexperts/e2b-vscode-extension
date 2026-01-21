import * as vscode from 'vscode';
import { Sandbox } from '@e2b/code-interpreter';

export interface FileInfo {
  name: string;
  path: string;
  isDir: boolean;
}

export interface SandboxInfo {
  sandboxId: string;
  templateId?: string;
  name?: string;
  metadata?: Record<string, string>;
  startedAt?: string;
}

export class E2BClient {
  private static instance: E2BClient;
  private sandbox: Sandbox | null = null;
  private _sandboxId: string | null = null;

  private constructor() {}

  static getInstance(): E2BClient {
    if (!E2BClient.instance) {
      E2BClient.instance = new E2BClient();
    }
    return E2BClient.instance;
  }

  get isConnected(): boolean {
    return this.sandbox !== null;
  }

  get sandboxId(): string | null {
    return this._sandboxId;
  }

  getApiKey(): string | undefined {
    const config = vscode.workspace.getConfiguration('e2b');
    const configKey = config.get<string>('apiKey');
    if (configKey && configKey.trim() !== '') {
      return configKey;
    }
    return process.env.E2B_API_KEY;
  }

  hasApiKey(): boolean {
    return !!this.getApiKey();
  }

  async setApiKey(apiKey: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('e2b');
    await config.update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
  }

  async listSandboxes(): Promise<SandboxInfo[]> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('E2B API key not configured');
    }

    try {
      const paginator = await Sandbox.list({ apiKey });
      const sandboxes = await paginator.nextItems();
      return sandboxes.map((s: any) => ({
        sandboxId: s.sandboxId,
        templateId: s.templateId,
        name: s.name,
        metadata: s.metadata,
        startedAt: s.startedAt,
      }));
    } catch (error) {
      throw error;
    }
  }

  async connect(sandboxId: string): Promise<void> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('E2B API key not configured. Set it in settings or E2B_API_KEY environment variable.');
    }

    try {
      this.sandbox = await Sandbox.connect(sandboxId, { apiKey });
      this._sandboxId = sandboxId;
    } catch (error) {
      this.sandbox = null;
      this._sandboxId = null;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.sandbox = null;
    this._sandboxId = null;
  }

  async listFiles(path: string): Promise<FileInfo[]> {
    if (!this.sandbox) {
      throw new Error('Not connected to sandbox');
    }

    const entries = await this.sandbox.files.list(path);
    return entries.map((entry: any) => ({
      name: entry.name,
      path: entry.path,
      isDir: entry.type === 'dir',
    }));
  }

  async readFile(path: string): Promise<string> {
    if (!this.sandbox) {
      throw new Error('Not connected to sandbox');
    }
    return await this.sandbox.files.read(path);
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (!this.sandbox) {
      throw new Error('Not connected to sandbox');
    }
    await this.sandbox.files.write(path, content);
  }

  async deleteFile(path: string): Promise<void> {
    if (!this.sandbox) {
      throw new Error('Not connected to sandbox');
    }
    await this.sandbox.files.remove(path);
  }

  async makeDirectory(path: string): Promise<void> {
    if (!this.sandbox) {
      throw new Error('Not connected to sandbox');
    }
    await this.sandbox.files.makeDir(path);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    if (!this.sandbox) {
      throw new Error('Not connected to sandbox');
    }
    await this.sandbox.files.rename(oldPath, newPath);
  }

  async runCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (!this.sandbox) {
      throw new Error('Not connected to sandbox');
    }
    const result = await this.sandbox.commands.run(command);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }

  async stat(path: string): Promise<{ isDir: boolean; size: number; mtime: number }> {
    if (!this.sandbox) {
      throw new Error('Not connected to sandbox');
    }
    // Use ls command to get file info since SDK may not have direct stat
    const result = await this.sandbox.commands.run(`stat -c '%F %s %Y' "${path}" 2>/dev/null || stat -f '%HT %z %m' "${path}"`);
    const parts = result.stdout.trim().split(' ');
    const isDir = parts[0]?.toLowerCase().includes('directory') || parts[0] === 'directory';
    return {
      isDir,
      size: parseInt(parts[1] || '0', 10),
      mtime: parseInt(parts[2] || '0', 10) * 1000,
    };
  }

  getSandbox(): Sandbox | null {
    return this.sandbox;
  }
}

export const e2bClient = E2BClient.getInstance();
