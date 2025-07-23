# GitHub Issue Scraper with AI Analysis

A CLI tool for scraping GitHub issues within specific repositories and product areas, with AI-powered analysis via Jan AI (local) or Google Gemini (cloud).

## Features

- 🔍 **Smart Issue Discovery**: Search GitHub repositories for issues related to specific product areas
- 🤖 **AI-Powered Analysis**: Choose between Jan AI (local) or Google Gemini (cloud) for intelligent relevance scoring and workaround detection
- 📊 **Comprehensive Reports**: Generate detailed reports with relevance scores, workarounds, and metadata
- 🎯 **Advanced Filtering**: Filter by relevance score, framework, browser, and more
- ⚡ **Batch Processing**: Efficiently analyze multiple issues with intelligent batching
- 🔧 **Error Resilience**: Robust error handling with fallback analysis when AI is unavailable

## Installation

```bash
npm install -g github-issue-scraper
```

## Quick Start

### 1. Set up GitHub Token

```bash
export GITHUB_TOKEN="your_github_token_here"
```

### 2. Choose Your AI Provider

#### Option A: Jan AI (Local, Free)

```bash
# Download Jan AI from https://jan.ai
# Enable API server in Jan settings
# Download a model (e.g., Llama 3.2 3B Instruct)
export JAN_MODEL="llama-3.2-3b-instruct"
```

#### Option B: Google Gemini (Cloud, Requires API Key)

```bash
# Get API key from https://makersuite.google.com/app/apikey
export GEMINI_API_KEY="your_gemini_api_key_here"
```

### 3. Run the Scraper

```bash
# Using Jan AI (default)
github-issue-scraper -r microsoft/vscode -p "editor performance"

# Using Google Gemini
github-issue-scraper -r microsoft/vscode -p "editor performance" --provider gemini

# Without AI (fallback analysis)
github-issue-scraper -r microsoft/vscode -p "editor performance" --no-ai

# Interactive mode
github-issue-scraper --interactive
```

## AI Provider Configuration

### Jan AI (Local)

```bash
export JAN_URL="http://localhost:1337/v1"              # Jan server URL
export JAN_MODEL="llama-3.2-3b-instruct"              # Model name (required)
export JAN_TEMPERATURE="0.3"                          # Temperature (optional)
export JAN_MAX_TOKENS="4000"                          # Max tokens (optional)
export JAN_TIMEOUT="120000"                           # Timeout in ms (optional)
```

### Google Gemini (Cloud)

```bash
export GEMINI_API_KEY="your-api-key-here"             # API key (required)
export GEMINI_MODEL="gemini-2.0-flash-001"           # Model name (optional)
export GEMINI_TEMPERATURE="0.3"                       # Temperature (optional)
export GEMINI_MAX_TOKENS="4000"                       # Max tokens (optional)
export GEMINI_TIMEOUT="120000"                        # Timeout in ms (optional)
```

## Usage Examples

### Basic Usage

```bash
# Analyze React-related issues in Facebook's React repository
github-issue-scraper -r facebook/react -p "hooks" --max-issues 25

# Find authentication issues in Microsoft VSCode
github-issue-scraper -r microsoft/vscode -p "authentication" --provider gemini

# Search for UI performance issues with high relevance threshold
github-issue-scraper -r owner/repo -p "ui performance" --min-relevance-score 70
```

### Advanced Usage

```bash
# Verbose output with custom output directory
github-issue-scraper -r owner/repo -p "api bugs" --verbose -o ./my-reports

# Interactive mode for step-by-step configuration
github-issue-scraper --interactive

# Disable AI analysis (use basic fallback)
github-issue-scraper -r owner/repo -p "database" --no-ai
```

## CLI Options

| Option                              | Description                            | Default   |
| ----------------------------------- | -------------------------------------- | --------- |
| `-r, --repository <repo>`           | GitHub repository (owner/repo format)  | -         |
| `-p, --product-area <area>`         | Product area keywords to filter issues | -         |
| `-m, --max-issues <number>`         | Maximum number of issues to process    | 50        |
| `-s, --min-relevance-score <score>` | Minimum relevance score (0-100)        | 30        |
| `-o, --output-path <path>`          | Output directory for reports           | ./reports |
| `--provider <provider>`             | AI provider: jan or gemini             | jan       |
| `--no-ai`                           | Disable AI analysis (use fallback)     | false     |
| `-v, --verbose`                     | Enable verbose logging                 | false     |
| `-i, --interactive`                 | Run in interactive mode                | false     |
| `--setup`                           | Show setup instructions                | false     |

## Environment Variables

### General

| Variable              | Description                       | Required |
| --------------------- | --------------------------------- | -------- |
| `GITHUB_TOKEN`        | GitHub personal access token      | Yes      |
| `GITHUB_REPOSITORY`   | Default repository (owner/repo)   | No       |
| `PRODUCT_AREA`        | Default product area keywords     | No       |
| `MAX_ISSUES`          | Default maximum issues to process | No       |
| `MIN_RELEVANCE_SCORE` | Default minimum relevance score   | No       |
| `OUTPUT_PATH`         | Default output directory          | No       |

### Jan AI Provider

| Variable          | Description                  | Default                  |
| ----------------- | ---------------------------- | ------------------------ |
| `JAN_URL`         | Jan AI server URL            | http://localhost:1337/v1 |
| `JAN_MODEL`       | Jan AI model name            | Required for Jan         |
| `JAN_TEMPERATURE` | Jan AI temperature (0.0-2.0) | 0.3                      |
| `JAN_MAX_TOKENS`  | Jan AI max tokens            | 4000                     |
| `JAN_TIMEOUT`     | Jan AI timeout (ms)          | 120000                   |

### Gemini AI Provider

| Variable             | Description                  | Default              |
| -------------------- | ---------------------------- | -------------------- |
| `GEMINI_API_KEY`     | Google Gemini API key        | Required for Gemini  |
| `GEMINI_MODEL`       | Gemini model name            | gemini-2.0-flash-001 |
| `GEMINI_TEMPERATURE` | Gemini temperature (0.0-2.0) | 0.3                  |
| `GEMINI_MAX_TOKENS`  | Gemini max tokens            | 4000                 |
| `GEMINI_TIMEOUT`     | Gemini timeout (ms)          | 120000               |

## AI Provider Comparison

| Feature         | Jan AI                     | Google Gemini                |
| --------------- | -------------------------- | ---------------------------- |
| **Cost**        | Free                       | Pay-per-use                  |
| **Privacy**     | Local processing           | Cloud processing             |
| **Setup**       | Download and run locally   | API key required             |
| **Speed**       | Depends on local hardware  | Fast (cloud)                 |
| **Models**      | Various open-source models | Google's Gemini models       |
| **Reliability** | Depends on local setup     | High (Google infrastructure) |

## Report Format

The tool generates comprehensive JSON and markdown reports with:

- **Issue Metadata**: Title, description, labels, dates, author
- **AI Analysis**: Relevance score, reasoning, framework/browser detection
- **Workarounds**: Detected workarounds with complexity and implementation difficulty
- **Filtering**: Applied filters and reasoning
- **Statistics**: Total issues analyzed, relevant issues found, average scores

## Troubleshooting

### Jan AI Issues

```bash
# Check if Jan is running
curl http://localhost:1337/v1/models

# Verify model is loaded
echo $JAN_MODEL

# Check Jan AI logs in the Jan application
```

### Gemini AI Issues

```bash
# Verify API key is set
echo $GEMINI_API_KEY

# Test API key (requires curl)
curl -H "Content-Type: application/json" \
     -d '{"contents":[{"parts":[{"text":"Hello"}]}]}' \
     "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent?key=$GEMINI_API_KEY"
```

### Common Issues

- **"No issues found"**: Try broader keywords or lower relevance threshold
- **Rate limiting**: Wait a few minutes and retry, or use smaller batch sizes
- **Token exceeded**: Reduce `MAX_TOKENS` or use more specific keywords
- **API errors**: Check network connection and API credentials

## Development

```bash
# Clone the repository
git clone https://github.com/your-org/github-issue-scraper.git
cd github-issue-scraper

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run locally
npm start -- -r microsoft/vscode -p "performance"
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Changelog

### v2.0.0

- ✨ **NEW**: Google Gemini AI provider support
- ✨ **NEW**: AI provider switching with `--provider` flag
- ✨ **NEW**: Unified AI provider abstraction
- 🔧 **IMPROVED**: Better error handling and fallback analysis
- 🔧 **IMPROVED**: Enhanced interactive mode with provider selection
- 📚 **UPDATED**: Comprehensive documentation for both providers
- ⚠️ **BREAKING**: `--no-jan` deprecated in favor of `--no-ai`

### v1.0.0

- Initial release with Jan AI support
- GitHub issue scraping and analysis
- Workaround detection
- Report generation
