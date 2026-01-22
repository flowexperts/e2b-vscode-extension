# GitHub Actions Workflows

This directory contains automated workflows for the E2B Sandbox Explorer VS Code extension.

## Workflows

### publish.yml - Automated Publishing

Automatically publishes the extension to the VS Code Marketplace and creates GitHub releases when version tags are pushed.

**Trigger:** Push of tags matching `v*.*.*` (e.g., `v0.1.4`, `v1.0.0`)

**What it does:**
1. Validates the build by compiling and packaging the extension
2. Checks that package.json version matches the git tag
3. Publishes to VS Code Marketplace
4. Creates a GitHub release with the .vsix file attached

## Setup Instructions

### 1. Configure the VSCE_PAT Secret

Before the workflow can publish to the VS Code Marketplace, you need to set up a Personal Access Token:

1. **Create a Personal Access Token (PAT):**
   - Follow the steps in [PUBLISHING.md](../../PUBLISHING.md) sections 1-4
   - Generate a PAT from Azure DevOps with Marketplace publish permissions
   - Keep the token secure - you'll need it in the next step

2. **Add the secret to GitHub:**
   - Go to your repository on GitHub
   - Navigate to Settings > Secrets and variables > Actions
   - Click "New repository secret"
   - Name: `VSCE_PAT`
   - Value: Paste your Personal Access Token
   - Click "Add secret"

### 2. Publishing a New Version

To publish a new version of the extension:

1. **Update the version** in `package.json`:
   ```json
   {
     "version": "0.1.4"
   }
   ```

2. **Update CHANGELOG.md** with release notes for the new version

3. **Commit your changes:**
   ```bash
   git add package.json CHANGELOG.md
   git commit -m "chore: bump version to 0.1.4"
   git push origin main
   ```

4. **Create and push the version tag:**
   ```bash
   git tag v0.1.4
   git push origin v0.1.4
   ```

5. **Monitor the workflow:**
   - Go to the "Actions" tab in your GitHub repository
   - Watch the "Publish Extension" workflow run
   - If successful, your extension will be published to the marketplace
   - A GitHub release will be created with the .vsix file

### 3. Troubleshooting

**Workflow fails at "Validate version matches tag"**
- Ensure the version in `package.json` matches your git tag (without the 'v' prefix)
- Example: Tag `v0.1.4` requires `"version": "0.1.4"` in package.json

**Workflow fails at "Publish to VS Code Marketplace"**
- Check that the `VSCE_PAT` secret is set correctly
- Verify your PAT hasn't expired (they expire after 1 year)
- Ensure your publisher account is in good standing
- See [PUBLISHING.md](../../PUBLISHING.md) for manual publishing as a fallback

**Workflow fails at "Create GitHub Release"**
- Check repository permissions in Settings > Actions > General
- Ensure "Read and write permissions" is enabled for workflows
- Verify the workflow has `contents: write` permission

**Version already published**
- You cannot publish the same version twice to the marketplace
- Increment the version number in package.json
- Delete and recreate the git tag with the new version

## Manual Publishing

If you need to publish manually (e.g., workflow is broken), see [PUBLISHING.md](../../PUBLISHING.md) for step-by-step instructions.

## Workflow Permissions

The publish workflow requires these permissions:
- `contents: write` - To create GitHub releases
- `id-token: write` - For secure token handling

These are explicitly set in the workflow file.

## Pre-release Versions

Tags containing "alpha" or "beta" (e.g., `v0.2.0-beta.1`) will be marked as pre-releases on GitHub.
