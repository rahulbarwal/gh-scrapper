# GitHub Issue Scraper

A powerful CLI tool for scraping GitHub issues within specific repositories and product areas. Extract relevant problems, identify workarounds, and generate comprehensive reports to understand user pain points and available solutions.

## Features

- 🔍 **Smart Search**: Uses GitHub's Search API to find relevant issues by product area keywords
- ⚡ **Optimized Performance**: Filters issues server-side before downloading for faster processing
- 🎯 **Intelligent Relevance Scoring**: Advanced scoring algorithm to rank issue relevance (0-100%)
- 💬 **Workaround Extraction**: Automatically identifies and extracts solutions from issue comments
- 🔐 **Secure Authentication**: GitHub token-based authentication with secure storage
- 📊 **Comprehensive Reports**: Generate detailed markdown reports with issue summaries and workarounds
- 🚀 **Rate Limit Handling**: Automatic rate limit detection and backoff strategies
- 📝 **Multiple Output Formats**: Clean, structured markdown reports with metadata
- 🛠️ **Interactive Setup**: Guided configuration for first-time users

## Installation

### Prerequisites

- Node.js 16.x or higher
- npm or yarn package manager
- GitHub personal access token

### Install from Source

1. Clone the repository:

```bash
git clone <repository-url>
cd github-issue-scraper
```

2. Install dependencies:

```bash
npm install
```

3. Build the project:

```bash
npm run build
```

4. Make the CLI executable (if not already):

```bash
chmod +x dist/cli/index.js
```

5. Optionally, link globally for system-wide access:

```bash
npm link
```

6. Verify installation:

```bash
# Test the CLI is working
github-issue-scraper --version

# Or if not linked globally
./bin/github-issue-scraper --version
```

### Install as Package (Future)

```bash
npm install -g github-issue-scraper
```

## How It Works

The GitHub Issue Scraper uses a **two-phase optimized approach**:

### Phase 1: Smart Search

- Uses GitHub's Search API to find issues matching your product area keywords
- Filters issues **server-side** before downloading (much faster than downloading all issues)
- Searches issue titles, descriptions, and labels for relevant content

### Phase 2: Detailed Analysis

- Downloads only the pre-filtered relevant issues
- Analyzes each issue's comments for workarounds and solutions
- Applies advanced relevance scoring (title 40%, labels 30%, description 20%, activity 10%)
- Extracts and classifies workarounds by effectiveness and author type

### Benefits

- ⚡ **10x Faster**: No need to download thousands of irrelevant issues
- 🎯 **More Accurate**: GitHub's search finds issues you might miss with simple filtering
- 💾 **Memory Efficient**: Processes smaller, targeted datasets
- 🚀 **API Friendly**: Uses fewer API calls, respects rate limits better

## Quick Start

### 1. Initial Setup

Configure your GitHub token:

```bash
github-issue-scraper --setup
```

Or set environment variable:

```bash
export GITHUB_TOKEN=your_github_token_here
```

### 2. Basic Usage

Scrape issues from a repository:

```bash
github-issue-scraper -r microsoft/vscode -p "editor performance"
```

### 3. Interactive Mode

For guided setup and configuration:

```bash
github-issue-scraper --interactive
```

## Usage

### Command Line Options

```
Usage: github-issue-scraper [options]

Options:
  -V, --version                      output the version number
  -r, --repository <repo>            GitHub repository in format owner/repo
  -p, --product-area <area>          Product area or keywords to filter issues
  -m, --max-issues <number>          Maximum number of issues to process (default: "50")
  -s, --min-relevance-score <score>  Minimum relevance score (0-100) (default: "30")
  -o, --output-path <path>           Output directory for reports (default: "./reports")
  -v, --verbose                      Enable verbose logging
  -i, --interactive                  Run in interactive mode with prompts
  --setup                            Run initial setup to configure GitHub token
  -h, --help                         display help for command
```

### Examples

#### Basic Issue Scraping

```bash
# Scrape VS Code editor performance issues
github-issue-scraper -r microsoft/vscode -p "editor performance"

# Scrape React hooks-related issues with custom limits
github-issue-scraper --repository facebook/react --product-area "hooks" --max-issues 25

# Scrape with verbose logging
github-issue-scraper -r owner/repo -p "api bugs" --verbose
```

#### Advanced Filtering

```bash
# Lower relevance threshold for broader results
github-issue-scraper -r microsoft/vscode -p "performance" --min-relevance-score 20

# Limit to most relevant issues only
github-issue-scraper -r facebook/react -p "hooks" --max-issues 10 --min-relevance-score 70

# Custom output directory
github-issue-scraper -r owner/repo -p "authentication" --output-path ./my-reports
```

#### Interactive and Setup

```bash
# First-time setup
github-issue-scraper --setup

# Interactive mode with prompts
github-issue-scraper --interactive

# Get help
github-issue-scraper --help
```

### Environment Variables

You can set default values using environment variables:

```bash
export GITHUB_TOKEN=your_github_token_here
export GITHUB_REPOSITORY=microsoft/vscode
export PRODUCT_AREA="performance issues"
export MAX_ISSUES=100
export MIN_RELEVANCE_SCORE=30
export OUTPUT_PATH=./reports
```

## Configuration

### GitHub Token Setup

1. **Create a Personal Access Token**:

   - Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
   - Click "Generate new token (classic)"
   - Select scopes: `public_repo` (for public repos) or `repo` (for private repos)
   - Copy the generated token

2. **Configure the Token**:

   ```bash
   # Option 1: Use setup command
   github-issue-scraper --setup

   # Option 2: Set environment variable
   export GITHUB_TOKEN=your_token_here

   # Option 3: Add to your shell profile
   echo 'export GITHUB_TOKEN=your_token_here' >> ~/.bashrc
   ```

### Configuration File

Configuration is automatically stored in `~/.github-issue-scraper/config.json`:

```json
{
  "repository": "microsoft/vscode",
  "productArea": "editor performance",
  "maxIssues": 50,
  "minRelevanceScore": 30,
  "outputPath": "./reports"
}
```

## Output Format

The tool generates markdown reports with the following structure:

```markdown
# GitHub Issues Report: repository-name - product-area

## Summary

- Total Issues Analyzed: X
- Relevant Issues Found: Y
- Report Generated: timestamp

## Issues

### Issue #123: Issue Title

**Labels**: bug, performance, editor
**Created**: 2024-01-15 by username
**Relevance Score**: 85/100

#### Summary

Executive summary of the issue...

#### Workarounds

1. **Maintainer**: Official workaround description
2. **Community**: Community-suggested solution

---
```

### Report Features

- **Executive Summaries**: AI-generated summaries of each issue
- **Workaround Classification**: Distinguishes between official and community solutions
- **Relevance Scoring**: Shows why each issue was selected
- **Metadata**: Includes scrape date, repository info, and statistics
- **Navigation**: Table of contents for easy browsing

### Sample Output

Here's an example of what a generated report looks like:

```markdown
# GitHub Issues Report: microsoft/vscode - editor performance

## Summary

- **Repository**: microsoft/vscode
- **Product Area**: editor performance
- **Total Issues Analyzed**: 1,247
- **Relevant Issues Found**: 23
- **Report Generated**: 2024-07-18T12:30:45.123Z
- **Relevance Threshold**: 30/100

## Issues

### Issue #156789: Editor becomes unresponsive with large files

**Labels**: bug, performance, editor-core, confirmed
**Created**: 2024-06-15 by @user123
**Updated**: 2024-07-10 by @vscode-bot
**Relevance Score**: 92/100
**Status**: Open

#### Summary

Users report that the VS Code editor becomes completely unresponsive when opening files larger than 50MB. The issue affects syntax highlighting, scrolling, and basic text editing operations. Multiple users have confirmed this behavior across different operating systems.

#### Workarounds

1. **Official (Maintainer)**: Disable syntax highlighting for large files by adding `"editor.largeFileOptimizations": true` to settings.json
2. **Community**: Use the "Large File Support" extension which provides chunked loading
3. **Community**: Split large files into smaller chunks before editing

#### Activity

- 👍 45 reactions
- 💬 23 comments
- 🔗 [View on GitHub](https://github.com/microsoft/vscode/issues/156789)

---

### Issue #145623: Slow syntax highlighting in TypeScript files

**Labels**: typescript, performance, syntax-highlighting
**Created**: 2024-05-20 by @developer456
**Updated**: 2024-07-08 by @typescript-team
**Relevance Score**: 78/100
**Status**: Open

#### Summary

TypeScript syntax highlighting becomes progressively slower as file size increases, particularly noticeable in files over 1000 lines. Users experience delays of 2-3 seconds when typing, making development frustrating.

#### Workarounds

1. **Official (Maintainer)**: Adjust `typescript.preferences.includePackageJsonAutoImports` to "off"
2. **Community**: Use `typescript.suggest.autoImports` set to false for better performance
3. **Community**: Enable `typescript.preferences.useLabelDetailsInCompletionEntries` for optimized completions

#### Activity

- 👍 32 reactions
- 💬 18 comments
- 🔗 [View on GitHub](https://github.com/microsoft/vscode/issues/145623)

---

## Statistics

- **Average Relevance Score**: 67.3/100
- **Issues with Workarounds**: 18/23 (78%)
- **Official Solutions**: 12
- **Community Solutions**: 31
- **Most Common Labels**: performance (23), editor-core (15), typescript (8)

## Methodology

Issues were filtered using the following criteria:

- Keywords: "editor", "performance", "slow", "unresponsive"
- Minimum relevance score: 30/100
- Issue state: Open
- Relevance factors: Title match (40%), Labels (30%), Description (20%), Activity (10%)
```

### Command Output Examples

#### Successful Execution

```bash
$ github-issue-scraper -r microsoft/vscode -p "editor performance" --verbose

 ℹ️  Starting GitHub Issue Scraper...
 🔍 Configuration validated successfully
 ℹ️  Repository: microsoft/vscode
 ℹ️  Product Area: editor performance
 ℹ️  Max Issues: 50
 ℹ️  Min Relevance Score: 30
 ℹ️  Output Path: ./reports
 🔍 Validating GitHub authentication...
 🔍 Authenticated as: your-username (Your Name)
 🔍 Rate limit: 4,987/5,000 remaining
 🔍 Testing repository access...
 🔍 Repository access confirmed
 ℹ️  Fetching issues from microsoft/vscode...
 🔍 Found 1,247 total issues
 🔍 Filtering by relevance to "editor performance"...
 🔍 Found 23 relevant issues (relevance >= 30)
 ℹ️  Analyzing issue comments for workarounds...
 🔍 Processed 156 comments across 23 issues
 🔍 Extracted 43 potential workarounds
 ℹ️  Generating report...
 ✅ Report generated: ./reports/microsoft-vscode-editor-performance-2024-07-18.md
 ℹ️  Summary: 23 relevant issues found with 18 containing workarounds
```

#### Interactive Mode

```bash
$ github-issue-scraper --interactive

 ℹ️  Running in interactive mode...
Enter GitHub repository (owner/repo): microsoft/vscode
Enter product area or keywords: editor performance
Maximum issues to process (50): 25
Minimum relevance score (30): 40
Output directory (./reports): ./my-reports
 ℹ️  Interactive configuration completed successfully! ✅
 ✅ Report generated: ./my-reports/microsoft-vscode-editor-performance-2024-07-18.md
```

#### Error Examples

```bash
$ github-issue-scraper -r invalid-repo -p "test"

 ❌ Repository access failed: Not Found

🔧 Repository Help:
   Format: owner/repository-name
   Example: microsoft/vscode
   Check: https://github.com/owner/repository-name
```

```bash
$ github-issue-scraper -r microsoft/vscode -p "very-specific-nonexistent-feature"

 ⚠️  No relevant issues found for product area "very-specific-nonexistent-feature"

🔧 Search Tips:
   Try: --min-relevance-score 20
   Use: broader keywords like 'performance' instead of 'slow rendering'
   Add: --verbose for detailed scoring information
```

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- --testPathPattern=issue-parser.test.ts

# Run tests with coverage
npm test -- --coverage

# Run tests in watch mode
npm test -- --watch
```

### Development Commands

```bash
# Start in development mode
npm run dev

# Build the project
npm run build

# Run linting
npm run lint

# Clean build artifacts
npm run clean
```

### Project Structure

```
github-issue-scraper/
├── src/
│   ├── cli/           # CLI interface and commands
│   ├── models/        # Data models and interfaces
│   └── services/      # Core business logic
├── dist/              # Compiled JavaScript output
├── reports/           # Generated issue reports
└── tests/             # Test files
```

## API Reference

### Core Services

- **GitHubClient**: Handles GitHub API interactions
- **RelevanceFilter**: Scores and filters issues by relevance
- **IssueParser**: Extracts and structures issue information
- **ReportGenerator**: Creates formatted markdown reports
- **ConfigManager**: Manages configuration and settings
- **AuthenticationService**: Handles GitHub authentication

### Data Models

- **GitHubIssue**: Complete issue information with metadata
- **Comment**: Issue comment with author classification
- **Workaround**: Extracted solution with effectiveness rating
- **Config**: Application configuration settings

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and add tests
4. Run tests: `npm test`
5. Commit your changes: `git commit -am 'Add feature'`
6. Push to the branch: `git push origin feature-name`
7. Submit a pull request

### Development Guidelines

- Write tests for new features
- Follow TypeScript best practices
- Use meaningful commit messages
- Update documentation for API changes
- Ensure all tests pass before submitting

## License

MIT License - see LICENSE file for details.

## Support

- 📖 **Documentation**: Check this README and inline help
- 🐛 **Issues**: Report bugs via GitHub Issues
- 💬 **Discussions**: Join GitHub Discussions for questions
- 📧 **Contact**: [Your contact information]

---

**Happy Issue Scraping!** 🚀

## Troubleshooting

### Common Issues and Solutions

#### Authentication Problems

**Problem**: `Authentication failed: Bad credentials`

```bash
Error: Authentication failed: Bad credentials
```

**Solutions**:

1. **Check token validity**:

   ```bash
   # Test your token manually
   curl -H "Authorization: token YOUR_TOKEN" https://api.github.com/user
   ```

2. **Regenerate token**:

   - Go to [GitHub Settings > Personal access tokens](https://github.com/settings/tokens)
   - Delete the old token and create a new one
   - Ensure proper scopes are selected (`repo` or `public_repo`)

3. **Clear and reconfigure**:

   ```bash
   # Remove old configuration
   rm -rf ~/.github-issue-scraper/

   # Run setup again
   github-issue-scraper --setup
   ```

#### Repository Access Issues

**Problem**: `Repository access failed: Not Found`

```bash
Error: Repository access failed: Not Found
```

**Solutions**:

1. **Verify repository format**:

   ```bash
   # Correct format: owner/repository
   github-issue-scraper -r microsoft/vscode -p "performance"

   # Incorrect formats:
   # ❌ https://github.com/microsoft/vscode
   # ❌ microsoft/vscode/issues
   # ❌ vscode
   ```

2. **Check repository existence**:

   - Visit `https://github.com/owner/repository` in your browser
   - Ensure the repository is public or you have access

3. **Private repository access**:
   - Ensure your token has `repo` scope (not just `public_repo`)
   - Verify you're a collaborator on private repositories

#### Rate Limiting

**Problem**: `API rate limit exceeded`

```bash
Error: API rate limit exceeded. Try again later.
```

**Solutions**:

1. **Wait and retry**:

   - GitHub allows 5,000 requests per hour for authenticated users
   - Wait for the rate limit to reset (shown in error message)

2. **Use authenticated requests**:

   ```bash
   # Ensure token is properly set
   export GITHUB_TOKEN=your_token_here
   github-issue-scraper -r owner/repo -p "keywords"
   ```

3. **Reduce request frequency**:
   ```bash
   # Process fewer issues
   github-issue-scraper -r owner/repo -p "keywords" --max-issues 25
   ```

#### No Results Found

**Problem**: `No relevant issues found`

```bash
Warning: No relevant issues found for product area "very specific keywords"
```

**Solutions**:

1. **Broaden search terms**:

   ```bash
   # Instead of very specific terms
   github-issue-scraper -r owner/repo -p "authentication OAuth2 JWT token validation"

   # Try broader terms
   github-issue-scraper -r owner/repo -p "authentication"
   ```

2. **Lower relevance threshold**:

   ```bash
   # Default threshold is 30, try lower
   github-issue-scraper -r owner/repo -p "keywords" --min-relevance-score 15
   ```

3. **Check issue availability**:

   ```bash
   # Use verbose mode to see what's happening
   github-issue-scraper -r owner/repo -p "keywords" --verbose
   ```

4. **Verify repository has issues**:
   - Visit the repository's Issues tab on GitHub
   - Some repositories disable issues or have very few

#### Network and Connection Issues

**Problem**: Network timeouts or connection errors

```bash
Error: Network error: connect ECONNREFUSED
```

**Solutions**:

1. **Check internet connection**:

   ```bash
   # Test GitHub API connectivity
   curl https://api.github.com/
   ```

2. **Corporate firewall/proxy**:

   ```bash
   # Set proxy if needed
   export HTTP_PROXY=http://proxy.company.com:8080
   export HTTPS_PROXY=http://proxy.company.com:8080
   ```

3. **VPN issues**:
   - Try disconnecting from VPN
   - Some VPNs block GitHub API access

#### Configuration Issues

**Problem**: `Configuration validation failed`

```bash
Error: Configuration validation failed: Repository is required
```

**Solutions**:

1. **Use interactive mode**:

   ```bash
   github-issue-scraper --interactive
   ```

2. **Set required parameters**:

   ```bash
   # Ensure both repository and product area are provided
   github-issue-scraper -r owner/repo -p "keywords"
   ```

3. **Check environment variables**:
   ```bash
   # Verify environment variables are set correctly
   echo $GITHUB_TOKEN
   echo $GITHUB_REPOSITORY
   ```

#### File Permission Issues

**Problem**: Cannot write to output directory

```bash
Error: EACCES: permission denied, mkdir './reports'
```

**Solutions**:

1. **Check directory permissions**:

   ```bash
   # Create directory manually
   mkdir -p ./reports
   chmod 755 ./reports
   ```

2. **Use different output path**:

   ```bash
   # Use home directory
   github-issue-scraper -r owner/repo -p "keywords" --output-path ~/reports

   # Use temporary directory
   github-issue-scraper -r owner/repo -p "keywords" --output-path /tmp/reports
   ```

#### Installation Issues

**Problem**: Command not found after installation

```bash
bash: github-issue-scraper: command not found
```

**Solutions**:

1. **Use npm link**:

   ```bash
   # In the project directory
   npm link
   ```

2. **Use npx**:

   ```bash
   npx github-issue-scraper -r owner/repo -p "keywords"
   ```

3. **Run directly**:
   ```bash
   # From project directory
   node dist/cli/index.js -r owner/repo -p "keywords"
   ```

### Debug Mode

Enable verbose logging to get detailed information:

```bash
github-issue-scraper -r owner/repo -p "keywords" --verbose
```

This will show:

- Authentication details
- API request/response information
- Relevance scoring details
- File operations
- Error stack traces

### Getting Help

If you're still experiencing issues:

1. **Check the logs**: Use `--verbose` flag for detailed output
2. **Verify your setup**: Run `github-issue-scraper --setup` to reconfigure
3. **Test with a known repository**: Try with `microsoft/vscode` or `facebook/react`
4. **Check GitHub status**: Visit [GitHub Status](https://www.githubstatus.com/)
5. **Report bugs**: Create an issue with:
   - Command you ran
   - Full error message
   - Operating system and Node.js version
   - Output with `--verbose` flag

### Performance Tips

1. **Optimize issue limits**:

   ```bash
   # For quick testing
   github-issue-scraper -r owner/repo -p "keywords" --max-issues 10

   # For comprehensive analysis
   github-issue-scraper -r owner/repo -p "keywords" --max-issues 100
   ```

2. **Use specific keywords**:

   ```bash
   # More specific = faster processing
   github-issue-scraper -r owner/repo -p "authentication bug"

   # Less specific = more processing time
   github-issue-scraper -r owner/repo -p "issue"
   ```

3. **Adjust relevance scoring**:
   ```bash
   # Higher threshold = fewer results, faster processing
   github-issue-scraper -r owner/repo -p "keywords" --min-relevance-score 50
   ```

## Changelog

### Version 1.0.0 (2024-07-18)

#### Features

- ✅ **CLI Interface**: Complete command-line interface with comprehensive options
- ✅ **GitHub Authentication**: Secure token-based authentication with GitHub API
- ✅ **Issue Filtering**: Smart relevance scoring and filtering by product area
- ✅ **Workaround Extraction**: Automatic identification of solutions in comments
- ✅ **Report Generation**: Structured markdown reports with metadata
- ✅ **Interactive Mode**: Guided setup and configuration
- ✅ **Error Handling**: Comprehensive error handling with helpful suggestions
- ✅ **Rate Limiting**: Automatic rate limit detection and backoff
- ✅ **Configuration Management**: Persistent configuration storage
- ✅ **Verbose Logging**: Detailed debugging information

#### CLI Features

- Command-line argument parsing with validation
- Interactive prompts for missing configuration
- Help documentation with examples
- Version information display
- Setup wizard for first-time users
- Environment variable support
- Custom output directory support

#### Documentation

- Comprehensive README with installation guide
- Usage examples and sample output
- Troubleshooting guide for common issues
- API reference and development guidelines
- Performance optimization tips

#### Testing

- Unit tests for all core functionality
- Integration tests for end-to-end workflows
- CLI-specific tests for argument parsing
- Error handling test coverage
- Mock GitHub API responses for testing

---

**Built with ❤️ for the developer community**
