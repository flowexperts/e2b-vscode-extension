# Publishing E2B Sandbox Explorer to VS Code Marketplace

This guide walks you through publishing the extension to the Visual Studio Code Marketplace.

## Prerequisites

- [x] Extension packaged as `.vsix` file ✅ (`e2b-sandbox-explorer-0.1.0.vsix`)
- [ ] Microsoft/Azure account
- [ ] Publisher account on VS Code Marketplace

## Quick Start

The extension is already built and packaged! You can find it at:
```
e2b-sandbox-explorer-0.1.0.vsix
```

## Publishing Methods

There are three ways to publish this extension:

1. **Automated Publishing via GitHub Actions (Recommended)** - Push a version tag and let CI/CD handle the rest
2. **Manual Installation (For Testing)** - Install locally to test before publishing
3. **Manual Publishing to Marketplace** - Manually publish using vsce CLI

## Option 1: Automated Publishing (Recommended)

The repository includes a GitHub Actions workflow that automatically publishes the extension when you push a version tag.

### Prerequisites

1. **Set up the VSCE_PAT secret** (one-time setup):
   - Follow Steps 1-3 in "Option 3: Manual Publishing" below to create your publisher account and Personal Access Token
   - Go to your GitHub repository Settings > Secrets and variables > Actions
   - Click "New repository secret"
   - Name: `VSCE_PAT`
   - Value: Paste your Personal Access Token
   - Click "Add secret"

### Publishing a New Version

1. **Update version** in `package.json`:
   ```json
   {
     "version": "0.1.4"
   }
   ```

2. **Update CHANGELOG.md** with release notes

3. **Commit and push to main**:
   ```bash
   git add package.json CHANGELOG.md
   git commit -m "chore: bump version to 0.1.4"
   git push origin main
   ```

4. **Create and push version tag**:
   ```bash
   git tag v0.1.4
   git push origin v0.1.4
   ```

5. **Monitor the workflow**:
   - Go to the "Actions" tab in your GitHub repository
   - The workflow will automatically:
     - Validate the build
     - Check version matches tag
     - Publish to VS Code Marketplace
     - Create a GitHub release with .vsix file

**Note:** See [.github/workflows/README.md](.github/workflows/README.md) for detailed workflow documentation.

## Option 2: Manual Installation (For Testing)

Before publishing to the marketplace, you can test the extension locally:

1. **Install from VSIX**:
   ```bash
   code --install-extension e2b-sandbox-explorer-0.1.0.vsix
   ```

2. **Or via VS Code UI**:
   - Open VS Code
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Type "Extensions: Install from VSIX"
   - Select the `e2b-sandbox-explorer-0.1.0.vsix` file

3. **Test the extension**:
   - Reload VS Code
   - Open the E2B Sandboxes view
   - Verify all features work correctly

## Option 3: Manual Publishing to VS Code Marketplace

### Step 1: Create a Publisher Account

1. **Go to the Visual Studio Marketplace publisher portal**:
   https://marketplace.visualstudio.com/manage

2. **Sign in** with your Microsoft/Azure account

3. **Create a publisher** (if you don't have one):
   - Click "Create Publisher"
   - Enter a unique publisher ID (e.g., "e2b" - must match `package.json`)
   - Fill in the required details
   - Verify your email

### Step 2: Create a Personal Access Token (PAT)

1. **Go to Azure DevOps**:
   https://dev.azure.com

2. **Create a new organization** (if you don't have one):
   - Click "Create new organization"
   - Follow the setup wizard

3. **Generate a PAT**:
   - Click on your profile icon (top right)
   - Select "Personal access tokens"
   - Click "New Token"
   - Configure:
     - **Name**: "VS Code Extension Publishing"
     - **Organization**: Select your organization
     - **Expiration**: Custom (set to 1 year or longer)
     - **Scopes**: Select "Marketplace" > "Manage"
   - Click "Create"
   - **IMPORTANT**: Copy the token immediately (you won't see it again!)

### Step 3: Login with vsce

```bash
# Login to the publisher account
bunx vsce login <publisher-name>

# When prompted, paste your Personal Access Token
# Example: bunx vsce login e2b
```

### Step 4: Publish the Extension

```bash
# Publish to the marketplace
bunx vsce publish

# Or publish with a specific version
bunx vsce publish 0.1.0

# Or publish a minor/major version bump
bunx vsce publish minor
bunx vsce publish major
```

The extension will be uploaded and reviewed. It typically appears in the marketplace within a few minutes.

### Step 5: Verify Publication

1. **Check the marketplace**:
   - Go to https://marketplace.visualstudio.com/
   - Search for "E2B Sandbox Explorer"
   - Verify the listing looks correct

2. **Install from marketplace**:
   ```bash
   # Uninstall local version first
   code --uninstall-extension bhavaniravi.e2b-sandbox-explorer

   # Install from marketplace
   code --install-extension bhavaniravi.e2b-sandbox-explorer
   ```

## Updating the Extension

### Using Automated Publishing (Recommended)

Follow the steps in "Option 1: Automated Publishing" above - just update the version, commit, and push a new tag.

### Using Manual Publishing

When you make changes and want to manually publish an update:

1. **Make your changes** to the code

2. **Update version** in `package.json`:
   ```json
   {
     "version": "0.2.0"  // Increment version
   }
   ```

3. **Rebuild and repackage**:
   ```bash
   bun run package
   ```

4. **Publish the update**:
   ```bash
   bunx vsce publish
   ```

## Publishing Checklist

Before publishing, ensure:

- [x] All code is committed to git
- [x] README.md is complete and accurate ✅
- [x] LICENSE file exists ✅
- [x] package.json has all required fields ✅
- [x] Extension works when installed from .vsix ✅
- [x] Screenshots added to README ✅
- [x] Icon (icon.png) added ✅
- [x] CHANGELOG.md created ✅
- [ ] Repository URL in package.json is correct
- [ ] Version number is correct

## Troubleshooting

### "Publisher not found"
- Make sure you've created a publisher account
- Ensure the publisher name in `package.json` matches your publisher ID
- Try logging in again: `bunx vsce login <publisher-name>`

### "Authentication failed"
- Your PAT may have expired - create a new one
- Ensure the PAT has "Marketplace: Manage" scope
- Try logging out and back in

### "Extension validation failed"
- Run `bunx vsce ls` to see all files that will be included
- Check for validation errors in the output
- Ensure all required fields in package.json are filled

### "Version already exists"
- You must increment the version number before publishing again
- Update the `version` field in package.json

## Resources

- [VS Code Extension Publishing Guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vsce Documentation](https://github.com/microsoft/vscode-vsce)
- [Marketplace Publisher Portal](https://marketplace.visualstudio.com/manage)
- [Azure DevOps](https://dev.azure.com)

## Support

For issues with the extension itself, please file an issue at:
https://github.com/e2b-dev/vscode-extension/issues
