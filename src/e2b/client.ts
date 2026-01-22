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

export interface FileIndexCache {
  files: Array<{ path: string; name: string }>;
  timestamp: number;
  path: string;
  useGit: boolean;
}

export class E2BClient {
  private static instance: E2BClient;
  private connectedSandboxes: Map<string, Sandbox> = new Map();
  private sandboxRootPaths: Map<string, string> = new Map();
  private fileIndexCache: Map<string, FileIndexCache> = new Map();

  private constructor() {}

  static getInstance(): E2BClient {
    if (!E2BClient.instance) {
      E2BClient.instance = new E2BClient();
    }
    return E2BClient.instance;
  }

  get isConnected(): boolean {
    return this.connectedSandboxes.size > 0;
  }

  get sandboxId(): string | null {
    // Return first sandbox ID for backwards compatibility
    const ids = this.getConnectedSandboxIds();
    return ids.length > 0 ? ids[0] : null;
  }

  getConnectedSandboxIds(): string[] {
    return Array.from(this.connectedSandboxes.keys());
  }

  getSandbox(sandboxId?: string): Sandbox | null {
    if (!sandboxId) {
      // Return first sandbox for backwards compatibility
      const ids = this.getConnectedSandboxIds();
      if (ids.length === 0) return null;
      return this.connectedSandboxes.get(ids[0]) || null;
    }
    return this.connectedSandboxes.get(sandboxId) || null;
  }

  isConnectedToSandbox(sandboxId: string): boolean {
    return this.connectedSandboxes.has(sandboxId);
  }

  getRootPath(sandboxId: string): string {
    return this.sandboxRootPaths.get(sandboxId) || '/';
  }

  setRootPath(sandboxId: string, rootPath: string): void {
    this.sandboxRootPaths.set(sandboxId, rootPath);
  }

  // File index cache methods
  private getCacheKey(sandboxId: string, path: string): string {
    return `${sandboxId}:${path}`;
  }

  getFileIndexCache(sandboxId: string, path: string): FileIndexCache | undefined {
    const key = this.getCacheKey(sandboxId, path);
    const cache = this.fileIndexCache.get(key);

    // Return cache if it's less than 5 minutes old
    if (cache && Date.now() - cache.timestamp < 5 * 60 * 1000) {
      return cache;
    }

    // Remove stale cache
    if (cache) {
      this.fileIndexCache.delete(key);
    }

    return undefined;
  }

  setFileIndexCache(sandboxId: string, path: string, files: Array<{ path: string; name: string }>, useGit: boolean): void {
    const key = this.getCacheKey(sandboxId, path);
    this.fileIndexCache.set(key, {
      files,
      timestamp: Date.now(),
      path,
      useGit
    });
  }

  invalidateFileIndexCache(sandboxId: string, path?: string): void {
    if (path) {
      // Invalidate cache for this specific path and all parent paths
      const key = this.getCacheKey(sandboxId, path);
      this.fileIndexCache.delete(key);

      // Invalidate parent directories
      let currentPath = path;
      while (currentPath !== '/' && currentPath.length > 0) {
        currentPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
        const parentKey = this.getCacheKey(sandboxId, currentPath);
        this.fileIndexCache.delete(parentKey);
      }
    } else {
      // Invalidate all cache for this sandbox
      const keysToDelete: string[] = [];
      for (const key of this.fileIndexCache.keys()) {
        if (key.startsWith(`${sandboxId}:`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.fileIndexCache.delete(key));
    }
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

    // Don't connect if already connected
    if (this.connectedSandboxes.has(sandboxId)) {
      return;
    }

    try {
      const sandbox = await Sandbox.connect(sandboxId, { apiKey });
      this.connectedSandboxes.set(sandboxId, sandbox);
    } catch (error) {
      throw error;
    }
  }

  async disconnect(sandboxId?: string): Promise<void> {
    if (sandboxId) {
      // Disconnect specific sandbox
      const sandbox = this.connectedSandboxes.get(sandboxId);
      if (sandbox) {
        this.connectedSandboxes.delete(sandboxId);
        this.sandboxRootPaths.delete(sandboxId);
        this.invalidateFileIndexCache(sandboxId);
      }
    } else {
      this.connectedSandboxes.clear();
      this.sandboxRootPaths.clear();
      this.fileIndexCache.clear();
    }
  }

  async listFiles(path: string, sandboxId: string): Promise<FileInfo[]> {
    const sandbox = this.connectedSandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Not connected to sandbox: ${sandboxId}`);
    }

    const entries = await sandbox.files.list(path);
    return entries.map((entry: any) => ({
      name: entry.name,
      path: entry.path,
      isDir: entry.type === 'dir',
    }));
  }

  async readFile(path: string, sandboxId: string): Promise<string> {
    const sandbox = this.connectedSandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Not connected to sandbox: ${sandboxId}`);
    }
    return await sandbox.files.read(path);
  }

  async writeFile(path: string, content: string, sandboxId: string): Promise<void> {
    const sandbox = this.connectedSandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Not connected to sandbox: ${sandboxId}`);
    }
    await sandbox.files.write(path, content);
  }

  async deleteFile(path: string, sandboxId: string): Promise<void> {
    const sandbox = this.connectedSandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Not connected to sandbox: ${sandboxId}`);
    }
    await sandbox.files.remove(path);
  }

  async makeDirectory(path: string, sandboxId: string): Promise<void> {
    const sandbox = this.connectedSandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Not connected to sandbox: ${sandboxId}`);
    }
    await sandbox.files.makeDir(path);
  }

  async rename(oldPath: string, newPath: string, sandboxId: string): Promise<void> {
    const sandbox = this.connectedSandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Not connected to sandbox: ${sandboxId}`);
    }
    await sandbox.files.rename(oldPath, newPath);
  }

  async runCommand(command: string, sandboxId: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const sandbox = this.connectedSandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Not connected to sandbox: ${sandboxId}`);
    }
    const result = await sandbox.commands.run(command);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }

  async stat(path: string, sandboxId: string): Promise<{ isDir: boolean; size: number; mtime: number }> {
    const sandbox = this.connectedSandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Not connected to sandbox: ${sandboxId}`);
    }
    // Use ls command to get file info since SDK may not have direct stat
    const result = await sandbox.commands.run(`stat -c '%F %s %Y' "${path}" 2>/dev/null || stat -f '%HT %z %m' "${path}"`);
    const parts = result.stdout.trim().split(' ');
    const isDir = parts[0]?.toLowerCase().includes('directory') || parts[0] === 'directory';
    return {
      isDir,
      size: parseInt(parts[1] || '0', 10),
      mtime: parseInt(parts[2] || '0', 10) * 1000,
    };
  }
}

export const e2bClient = E2BClient.getInstance();
