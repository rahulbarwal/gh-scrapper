# GitHub Issue Scraper

A powerful CLI tool for scraping GitHub issues within specific repositories and product areas. Extract relevant problems, identify workarounds, and generate comprehensive reports to understand user pain points and available solutions.

## Features

- 🔍 **Smart Search**: Uses GitHub's Search API to find relevant issues by product area keywords
- ⚡ **Optimized Performance**: Filters issues server-side before downloading for faster processing
- 🎯 **LLM-Powered Analysis**: Uses JAN's local LLM to analyze and score issue relevance (0-100%)
- 💬 **Intelligent Workaround Extraction**: LLM identifies and extracts solutions from issue comments
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
- JAN application for local LLM analysis (https://jan.ai/)

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

### Setting up JAN for LLM Analysis

This tool uses JAN's local LLM capabilities for intelligent issue analysis. Follow these steps to set up JAN:

1. **Install JAN**:

   - Download JAN from the official website: https://jan.ai/
   - Follow the installation instructions for your operating system
   - JAN provides a user-friendly interface for managing local LLMs
   - System requirements:
     - **Minimum**: 8GB RAM, dual-core CPU, 10GB free disk space
     - **Recommended**: 16GB RAM, quad-core CPU, 20GB free disk space
     - **For best performance**: 32GB RAM, 8+ core CPU or GPU acceleration

2. **Start JAN**:

   - Launch the JAN application
   - JAN runs a local server that provides an OpenAI-compatible API
   - The default endpoint is http://localhost:1337
   - Verify the server is running by visiting http://localhost:1337/health in your browser

3. **Load a Model**:

   - In the JAN interface, go to the Models tab
   - Download and load a model based on your needs:
     - **llama2** (Default): Good balance of performance and resource usage
     - **mistral**: Excellent analysis capabilities, better workaround extraction
     - **phi**: Lightweight option for systems with limited resources
     - **llama3**: Comprehensive understanding, best for in-depth analysis
   - Click on the model name to download it
   - After downloading, click "Load" to activate the model

4. **Test JAN Connectivity**:

   ```bash
   github-issue-scraper --test-jan
   ```

   This command will:

   - Verify that JAN is running and accessible
   - List all available models in your JAN installation
   - Test if your selected model is properly loaded
   - Save successful configuration for future use

5. **Configure JAN Options**:

   ```bash
   # Set custom JAN endpoint (if not using default)
   github-issue-scraper -r owner/repo -p "keywords" --jan-endpoint http://localhost:1337

   # Specify which model to use
   github-issue-scraper -r owner/repo -p "keywords" --jan-model mistral

   # Set both endpoint and model
   github-issue-scraper -r owner/repo -p "keywords" --jan-endpoint http://localhost:1337 --jan-model phi
   ```

   You can also set these options using environment variables:

   ```bash
   export JAN_ENDPOINT=http://localhost:1337
   export JAN_MODEL=mistral
   ```

6. **Model Selection Guide**:

   | Model   | Best For                                       | Resource Usage |
   | ------- | ---------------------------------------------- | -------------- |
   | llama2  | General analysis, balanced performance         | Medium         |
   | mistral | Technical repositories, detailed analysis      | Medium-High    |
   | phi     | Quick analysis, systems with limited resources | Low            |
   | llama3  | In-depth analysis, complex technical issues    | High           |

7. **Troubleshooting JAN Connection**:
   - Ensure JAN is running before starting the scraper
   - Check that your selected model is properly loaded in JAN
   - For large repositories, use smaller batch sizes or more powerful models
   - If analysis fails, try a different model or reduce the number of issues
   - Run with `--verbose` flag to see detailed JAN interaction logs
   - See the detailed JAN integration guide: [docs/jan-guide.md](docs/jan-guide.md)

## How It Works

The GitHub Issue Scraper uses a **LLM-powered analysis approach**:

### Phase 1: GitHub API Integration

- Retrieves issues from the specified GitHub repository
- Handles authentication and rate limiting automatically
- Collects all issue metadata, comments, and related information
- Prepares structured data for LLM analysis

### Phase 2: JAN LLM Analysis

- Sends issue data to JAN's local LLM for intelligent analysis
- Uses carefully crafted prompts to guide the LLM's analysis process
- Processes issues in batches to optimize performance and manage context limits
- Implements fallback strategies for handling large repositories

### Phase 3: LLM-Powered Intelligence

- **Relevance Scoring**: LLM determines how relevant each issue is to your product area (0-100%)
- **Workaround Extraction**: LLM identifies solutions from issue comments with author attribution
- **Issue Summarization**: LLM generates concise summaries of complex issues
- **Categorization**: LLM groups issues into meaningful categories
- **Priority Assessment**: LLM determines issue priority based on content analysis
- **Sentiment Analysis**: LLM evaluates the sentiment expressed in issues and comments

### Benefits

- 🧠 **Intelligent Analysis**: Uses natural language understanding instead of keyword matching
- 🔍 **Context-Aware**: Understands semantic meaning and relevance beyond simple text matching
- 💡 **Solution Finding**: Automatically extracts workarounds that might be buried in comments
- 📊 **Comprehensive Reports**: Generates rich, structured reports with meaningful insights
- 🚀 **Local Processing**: All analysis happens on your machine through JAN, keeping data private

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

````markdown
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

## LLM Analysis Details

### Understanding LLM-Generated Relevance Scores

The relevance score (0-100) indicates how closely an issue matches your product area:

- **90-100**: Directly addresses core aspects of the product area
- **70-89**: Strongly related to the product area with significant impact
- **50-69**: Moderately related with some relevant aspects
- **30-49**: Tangentially related or with minor relevance
- **0-29**: Minimal or no relevance to the product area

### Interpreting Workaround Classifications

The LLM classifies workarounds based on:

- **Author Type**:

  - **Maintainer**: Solutions from project maintainers or core team members
  - **Contributor**: Solutions from regular contributors or experienced users
  - **User**: Solutions from general community members

- **Effectiveness Rating**:

  - **Confirmed**: Workaround has been verified to solve the issue
  - **Suggested**: Proposed solution that may work but lacks confirmation
  - **Partial**: Solution that addresses part of the issue or works in limited cases

- **Confidence Score**: Indicates the LLM's confidence (0-100%) in the workaround's validity

### LLM-Generated Categories

The LLM automatically categorizes issues into meaningful groups based on:

- Root cause analysis
- Affected components
- Issue patterns and similarities
- Technical domains

### Example LLM Analysis

```json
{
  "id": 156789,
  "title": "Editor becomes unresponsive with large files",
  "relevanceScore": 92,
  "category": "Performance Degradation",
  "priority": "high",
  "summary": "VS Code editor becomes completely unresponsive when opening files larger than 50MB, affecting syntax highlighting, scrolling, and basic text editing operations across different operating systems.",
  "workarounds": [
    {
      "description": "Disable syntax highlighting for large files by adding 'editor.largeFileOptimizations': true to settings.json",
      "author": "vscode-team",
      "authorType": "maintainer",
      "effectiveness": "confirmed",
      "confidence": 95
    },
    {
      "description": "Use the 'Large File Support' extension which provides chunked loading",
      "author": "community-member",
      "authorType": "user",
      "effectiveness": "suggested",
      "confidence": 80
    }
  ],
  "tags": ["performance", "large-files", "editor-core", "optimization"],
  "sentiment": "negative"
}
```

### Understanding LLM Analysis Results

The GitHub Issue Scraper leverages JAN's LLM capabilities to provide rich, intelligent analysis:

#### 1. Relevance Scoring

Each issue receives a relevance score (0-100) indicating how closely it matches your product area:

| Score Range | Interpretation                                 | Action                                |
| ----------- | ---------------------------------------------- | ------------------------------------- |
| 90-100      | Direct match to core product area concerns     | Highest priority for review           |
| 70-89       | Strong relevance with significant impact       | Important to address                  |
| 50-69       | Moderate relevance with some important aspects | Consider after higher priority issues |
| 30-49       | Tangential relevance or minor connection       | Review if time permits                |
| 0-29        | Minimal relevance (filtered out by default)    | Typically safe to ignore              |

#### 2. Workaround Classification

The LLM identifies solutions from issue comments and classifies them:

**Author Types:**

- **Maintainer**: Official solutions from project team members (highest reliability)
- **Contributor**: Solutions from regular contributors (good reliability)
- **User**: Community-suggested solutions (variable reliability)

**Effectiveness Ratings:**

- **Confirmed**: Solution verified to work (highest confidence)
- **Suggested**: Proposed solution without verification (medium confidence)
- **Partial**: Solution that works in some cases (limited confidence)

**Confidence Score:**

- A percentage (0-100%) indicating the LLM's confidence in the solution
- Higher scores (80%+) indicate more reliable workarounds

#### 3. Sample Analysis Interpretation

For the example above:

- The issue has **very high relevance** (92/100) to the product area
- It's categorized as a **"Performance Degradation"** issue with **high priority**
- There are **two workarounds**:
  1. An **official solution** from the VS Code team (95% confidence)
  2. A **community suggestion** with good but lower confidence (80%)
- The issue has a **negative sentiment**, indicating user frustration
- It's tagged with relevant keywords for easy categorization

#### 4. Factors Affecting Analysis Quality

- **Model selection**: Different JAN models have different analysis capabilities
- **Issue complexity**: More complex issues may have less accurate analysis
- **Comment quality**: Clear, detailed comments yield better workaround extraction
- **Product area specificity**: More specific product areas yield more focused results

For detailed guidance on interpreting LLM analysis, see:

- [JAN Integration Guide](docs/jan-guide.md)
- [LLM Analysis Examples](docs/llm-analysis-examples.md)
````

## Methodology

Issues are analyzed using the following LLM-powered approach:

- **Natural Language Understanding**: LLM comprehends the semantic meaning of issues
- **Context-Aware Analysis**: LLM considers your product area in its relevance determination
- **Minimum relevance score**: Configurable threshold (default: 30/100)
- **Comprehensive Analysis**: Evaluates titles, descriptions, comments, and metadata
- **Intelligent Workaround Extraction**: Identifies solutions from conversation threads

````

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
````

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
npm test -- --testPathPattern=github-client.test.ts

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
- **JAN Client**: Interfaces with local LLM for analysis
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

### JAN Integration Issues

#### Problem: `JAN server connection failed`

```bash
Error: Cannot connect to JAN server at http://localhost:1337. Is JAN running?
```

**Solutions**:

1. **Check if JAN is running**:

   - Open the JAN application
   - Verify it's running and the interface is accessible
   - Check the status indicator in the JAN UI

2. **Verify endpoint configuration**:

   ```bash
   # Test JAN connectivity
   github-issue-scraper --test-jan

   # Specify custom endpoint if needed
   github-issue-scraper --test-jan --jan-endpoint http://localhost:1337
   ```

3. **Restart JAN**:
   - Close and reopen the JAN application
   - Wait for it to fully initialize before retrying

#### Problem: `Model not found in JAN`

```bash
Error: Model 'llama2' is not loaded in JAN. Available models: mistral, phi
```

**Solutions**:

1. **Load the model in JAN**:

   - Open JAN application
   - Go to the Models tab
   - Download and load the required model

2. **Use an available model**:

   ```bash
   # List available models
   github-issue-scraper --test-jan

   # Use an available model
   github-issue-scraper -r owner/repo -p "keywords" --jan-model mistral
   ```

3. **Check model name spelling**:
   - Model names are case-sensitive
   - Use the exact name as shown in JAN's interface

#### Problem: `LLM context length exceeded`

```bash
Error: LLM context length exceeded during analysis.
```

**Solutions**:

1. **Reduce batch size**:

   ```bash
   # Process fewer issues at once
   github-issue-scraper -r owner/repo -p "keywords" --max-issues 25
   ```

2. **Use a model with larger context window**:

   ```bash
   # Switch to a model with larger context capacity
   github-issue-scraper -r owner/repo -p "keywords" --jan-model mistral-large
   ```

3. **Simplify analysis**:
   - Focus on more specific product areas
   - Filter issues by labels or state first

#### Problem: `Invalid LLM response format`

```bash
Error: Failed to parse LLM response as valid JSON.
```

**Solutions**:

1. **Try a different model**:

   ```bash
   # Some models produce more consistent outputs
   github-issue-scraper -r owner/repo -p "keywords" --jan-model llama2
   ```

2. **Check JAN version**:

   - Ensure you're using a recent version of JAN
   - Update JAN if necessary

3. **Reduce complexity**:
   ```bash
   # Process fewer issues at once
   github-issue-scraper -r owner/repo -p "keywords" --max-issues 10
   ```

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
