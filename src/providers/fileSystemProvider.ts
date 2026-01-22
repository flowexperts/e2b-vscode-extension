import * as vscode from 'vscode';
import { e2bClient } from '../e2b/client';

export class E2BFileSystemProvider implements vscode.FileSystemProvider {
  private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this._onDidChangeFile.event;

  watch(): vscode.Disposable {
    // File watching not implemented for remote sandbox
    return new vscode.Disposable(() => {});
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const sandboxId = uri.authority;
    const path = uri.path || '/';

    if (!sandboxId) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    try {
      const info = await e2bClient.stat(path, sandboxId);
      return {
        type: info.isDir ? vscode.FileType.Directory : vscode.FileType.File,
        ctime: info.mtime,
        mtime: info.mtime,
        size: info.size,
      };
    } catch (error) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const sandboxId = uri.authority;
    const path = uri.path || '/';

    if (!sandboxId) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    try {
      const entries = await e2bClient.listFiles(path, sandboxId);
      return entries.map(entry => [
        entry.name,
        entry.isDir ? vscode.FileType.Directory : vscode.FileType.File,
      ]);
    } catch (error) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
  }

  async createDirectory(uri: vscode.Uri): Promise<void> {
    const sandboxId = uri.authority;

    if (!sandboxId) {
      throw vscode.FileSystemError.Unavailable(uri);
    }

    try {
      await e2bClient.makeDirectory(uri.path, sandboxId);
      e2bClient.invalidateFileIndexCache(sandboxId, uri.path);
      this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Created, uri }]);
    } catch (error) {
      throw vscode.FileSystemError.Unavailable(uri);
    }
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const sandboxId = uri.authority;

    if (!sandboxId) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    try {
      const content = await e2bClient.readFile(uri.path, sandboxId);
      return Buffer.from(content, 'utf-8');
    } catch (error) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean }): Promise<void> {
    const sandboxId = uri.authority;

    if (!sandboxId) {
      throw vscode.FileSystemError.Unavailable(uri);
    }

    try {
      const text = Buffer.from(content).toString('utf-8');
      await e2bClient.writeFile(uri.path, text, sandboxId);
      // Invalidate cache if this is a new file creation
      if (options.create) {
        e2bClient.invalidateFileIndexCache(sandboxId, uri.path);
      }
      this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    } catch (error) {
      throw vscode.FileSystemError.Unavailable(uri);
    }
  }

  async delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
    const sandboxId = uri.authority;

    if (!sandboxId) {
      throw vscode.FileSystemError.Unavailable(uri);
    }

    try {
      await e2bClient.deleteFile(uri.path, sandboxId);
      e2bClient.invalidateFileIndexCache(sandboxId, uri.path);
      this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
    } catch (error) {
      throw vscode.FileSystemError.Unavailable(uri);
    }
  }

  async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
    const sandboxId = oldUri.authority;

    if (!sandboxId) {
      throw vscode.FileSystemError.Unavailable(oldUri);
    }

    try {
      await e2bClient.rename(oldUri.path, newUri.path, sandboxId);
      e2bClient.invalidateFileIndexCache(sandboxId, oldUri.path);
      e2bClient.invalidateFileIndexCache(sandboxId, newUri.path);
      this._onDidChangeFile.fire([
        { type: vscode.FileChangeType.Deleted, uri: oldUri },
        { type: vscode.FileChangeType.Created, uri: newUri },
      ]);
    } catch (error) {
      throw vscode.FileSystemError.Unavailable(oldUri);
    }
  }

  notifyFileChanged(uri: vscode.Uri): void {
    this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }
}

export const e2bFileSystemProvider = new E2BFileSystemProvider();
