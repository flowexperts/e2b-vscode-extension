# Creating GitHub Releases

This guide explains how to create GitHub releases for the E2B Sandbox Explorer extension.

## Prerequisites

- Repository pushed to GitHub
- Built `.vsix` file ready for release
- Git tags for version tracking

## Method 1: Using GitHub CLI (Recommended)

### Install GitHub CLI

```bash
# macOS
brew install gh

# Linux
# See: https://github.com/cli/cli/blob/trunk/docs/install_linux.md

# Windows
# See: https://github.com/cli/cli#windows
```

### Authenticate

```bash
gh auth login
```

### Create a Release

#### Option A: Create Release with Tag

```bash
# Create tag and release in one command
gh release create v0.1.2 \
  e2b-sandbox-explorer-0.1.2.vsix \
  --title "v0.1.2 - Initial Release" \
  --notes "See [CHANGELOG.md](CHANGELOG.md) for full details."

# With full release notes from CHANGELOG
gh release create v0.1.2 \
  e2b-sandbox-explorer-0.1.2.vsix \
  --title "v0.1.2 - Initial Release" \
  --notes-file CHANGELOG.md
```

#### Option B: Create Tag First, Then Release

```bash
# Create and push tag
git tag -a v0.1.2 -m "Release version 0.1.2"
git push origin v0.1.2

# Create release from existing tag
gh release create v0.1.2 \
  e2b-sandbox-explorer-0.1.2.vsix \
  --title "v0.1.2 - Initial Release" \
  --notes "## What's New

- Initial public release
- Multi-sandbox support
- Smart file search with caching
- Integrated terminal
- Configurable ignore patterns

See [CHANGELOG.md](CHANGELOG.md) for full details."
```

#### Option C: Create Draft Release

```bash
# Create as draft to review before publishing
gh release create v0.1.2 \
  e2b-sandbox-explorer-0.1.2.vsix \
  --draft \
  --title "v0.1.2 - Initial Release" \
  --notes-file CHANGELOG.md

# Later, publish it
gh release edit v0.1.2 --draft=false
```

### List Releases

```bash
# View all releases
gh release list

# View specific release
gh release view v0.1.2
```

### Upload Additional Assets

```bash
# Add more files to existing release
gh release upload v0.1.2 additional-file.txt
```

## Method 2: Using GitHub Web UI

### Step 1: Navigate to Releases

1. Go to your repository on GitHub
2. Click on **"Releases"** (right sidebar)
3. Click **"Draft a new release"** or **"Create a new release"**

### Step 2: Create Tag

1. Click on **"Choose a tag"** dropdown
2. Type your version tag (e.g., `v0.1.2`)
3. Click **"Create new tag: v0.1.2 on publish"**

### Step 3: Fill Release Details

**Release Title:**
```
v0.1.2 - Initial Release
```

**Release Notes:**
```markdown
## 🎉 Initial Release

This is the first public release of E2B Sandbox Explorer!

### ✨ Features

- **Multi-Sandbox Support**: Connect to multiple sandboxes simultaneously
- **Smart File Search**: Fast file indexing with intelligent caching
- **Git Integration**: Automatically respects .gitignore
- **Integrated Terminal**: Interactive PTY sessions
- **Configurable**: Customizable search ignore patterns

### 📦 Installation

Install from VS Code Marketplace:
https://marketplace.visualstudio.com/items?itemName=bhavaniravi.e2b-sandbox-explorer

Or install manually:
1. Download `e2b-sandbox-explorer-0.1.2.vsix` below
2. Open VS Code
3. Run: Extensions: Install from VSIX

### 📖 Documentation

See [README.md](README.md) for usage instructions and [CHANGELOG.md](CHANGELOG.md) for full changelog.

### 🔗 Links

- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=bhavaniravi.e2b-sandbox-explorer)
- [Documentation](https://github.com/e2b-dev/vscode-extension#readme)
- [Report Issues](https://github.com/e2b-dev/vscode-extension/issues)
```

### Step 4: Upload Assets

1. Drag and drop or click **"Attach binaries"**
2. Upload `e2b-sandbox-explorer-0.1.2.vsix`
3. Optionally upload additional files (LICENSE, README, etc.)

### Step 5: Publish

- **For immediate release**: Click **"Publish release"**
- **For review**: Check **"Set as a pre-release"** or **"Save draft"**

## Method 3: Using Git + GitHub API

### Manual Git Tagging

```bash
# Create annotated tag
git tag -a v0.1.2 -m "Release version 0.1.2"

# Push tag to GitHub
git push origin v0.1.2

# Or push all tags
git push --tags
```

Then create the release via GitHub UI or CLI.

### Using GitHub API (Advanced)

```bash
# Create release via API
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer YOUR_GITHUB_TOKEN" \
  https://api.github.com/repos/e2b-dev/vscode-extension/releases \
  -d '{
    "tag_name": "v0.1.2",
    "name": "v0.1.2 - Initial Release",
    "body": "Release notes here",
    "draft": false,
    "prerelease": false
  }'
```

## Workflow Example

Here's a complete workflow for releasing a new version:

```bash
# 1. Update version in package.json
# Edit package.json: "version": "0.2.0"

# 2. Update CHANGELOG.md
# Add new version section with changes

# 3. Commit changes
git add package.json CHANGELOG.md
git commit -m "chore: bump version to 0.2.0"
git push

# 4. Build the extension
bun run package

# 5. Create tag and release
gh release create v0.2.0 \
  e2b-sandbox-explorer-0.2.0.vsix \
  --title "v0.2.0 - Feature Update" \
  --notes-file CHANGELOG.md

# 6. (Optional) Publish to VS Code Marketplace
bunx vsce publish
```

## Automated Release Workflow

### Using GitHub Actions

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install

      - name: Build extension
        run: bun run package

      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: '*.vsix'
          body_path: CHANGELOG.md
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Then simply push a tag:

```bash
git tag v0.2.0
git push origin v0.2.0
```

The workflow will automatically build and create a GitHub release!

## Best Practices

1. **Semantic Versioning**: Use `v0.1.0`, `v0.2.0`, `v1.0.0` format
2. **Changelog**: Always include or reference CHANGELOG.md
3. **Assets**: Upload the `.vsix` file for manual installation
4. **Release Notes**: Write clear, user-friendly notes
5. **Pre-releases**: Use for beta versions (`v0.2.0-beta.1`)
6. **Testing**: Test the `.vsix` file before releasing

## Version Numbering

Follow semantic versioning:

- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features, backwards compatible
- **Patch** (0.0.1): Bug fixes, backwards compatible

Example:
- `v0.1.0` - Initial release
- `v0.1.1` - Bug fix
- `v0.2.0` - New features
- `v1.0.0` - First stable release

## Troubleshooting

### "Tag already exists"
```bash
# Delete local tag
git tag -d v0.1.2

# Delete remote tag
git push origin :refs/tags/v0.1.2

# Recreate tag
git tag -a v0.1.2 -m "Release version 0.1.2"
git push origin v0.1.2
```

### "Release already exists"
```bash
# Delete release (keeps tag)
gh release delete v0.1.2

# Recreate
gh release create v0.1.2 e2b-sandbox-explorer-0.1.2.vsix --title "..." --notes "..."
```

## Resources

- [GitHub CLI Documentation](https://cli.github.com/manual/gh_release)
- [GitHub Releases Guide](https://docs.github.com/en/repositories/releasing-projects-on-github)
- [Semantic Versioning](https://semver.org/)
- [GitHub Actions](https://docs.github.com/en/actions)
