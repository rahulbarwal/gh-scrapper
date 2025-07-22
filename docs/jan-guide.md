# JAN Integration Guide

This guide provides detailed instructions for setting up and using JAN with the GitHub Issue Scraper.

## What is JAN?

JAN is an open-source, cross-platform desktop application that allows you to run large language models (LLMs) locally on your computer. The GitHub Issue Scraper uses JAN's OpenAI-compatible API to perform intelligent analysis of GitHub issues.

## Installation

1. **Download JAN**:

   - Visit the official JAN website: https://jan.ai/
   - Download the appropriate version for your operating system (Windows, macOS, or Linux)

2. **Install JAN**:

   - Run the installer and follow the on-screen instructions
   - Launch JAN after installation

3. **Download and Load a Model**:
   - In the JAN interface, navigate to the Models tab
   - Browse available models and download one appropriate for your needs
   - Recommended models:
     - **llama2**: Good balance of performance and resource usage
     - **mistral**: Excellent analysis capabilities
     - **phi**: Lightweight option for systems with limited resources
   - Click on the model to load it into memory

## Configuration

### Basic Configuration

The GitHub Issue Scraper is pre-configured to work with JAN's default settings:

- Default endpoint: `http://localhost:1337`
- Default model: `llama2`

You can verify your JAN configuration with:

```bash
github-issue-scraper --test-jan
```

This command will:

1. Check if JAN is running and accessible
2. List all available models in your JAN installation
3. Test if your selected model is properly loaded
4. Save successful configuration for future use

### Custom Configuration

You can customize the JAN integration using command-line options:

```bash
# Use a custom endpoint
github-issue-scraper -r owner/repo -p "keywords" --jan-endpoint http://localhost:1337

# Use a specific model
github-issue-scraper -r owner/repo -p "keywords" --jan-model mistral

# Combine options
github-issue-scraper -r owner/repo -p "keywords" --jan-endpoint http://localhost:1337 --jan-model phi
```

Or set environment variables:

```bash
export JAN_ENDPOINT=http://localhost:1337
export JAN_MODEL=mistral
```

### Model Configuration Guide

JAN supports multiple models with different capabilities. Here's how to configure and use them:

#### 1. Installing Models in JAN

1. Open the JAN application
2. Navigate to the "Models" tab
3. Browse available models in the "Explore" section
4. Click "Download" next to your desired model
5. Wait for the download to complete
6. Click "Load" to activate the model

#### 2. Selecting Models in GitHub Issue Scraper

After loading a model in JAN, you can select it for use:

```bash
# Command line option
github-issue-scraper -r owner/repo -p "keywords" --jan-model model_name

# Environment variable
export JAN_MODEL=model_name
github-issue-scraper -r owner/repo -p "keywords"

# Interactive mode
github-issue-scraper --interactive
# Then select your model when prompted
```

#### 3. Finding Available Models

To see which models are available in your JAN installation:

```bash
github-issue-scraper --test-jan
```

This will list all models currently available in your JAN installation.

#### 4. Model Names and Case Sensitivity

Model names in JAN are case-sensitive. Common model names include:

- `llama2`
- `mistral`
- `phi`
- `llama3`

Always use the exact name as shown in JAN's interface or in the `--test-jan` output.

### Advanced Configuration

For advanced users, you can configure additional JAN parameters:

```bash
# Set JAN API key (if required)
export JAN_API_KEY=your_api_key_here

# Configure retry behavior
export JAN_MAX_RETRIES=5

# Set request timeout
export JAN_TIMEOUT=120000  # 120 seconds
```

## Troubleshooting

### Connection Issues

**Problem**: Cannot connect to JAN server

**Solutions**:

- Ensure JAN application is running
- Check if the endpoint is correct (default: http://localhost:1337)
- Verify no firewall is blocking the connection
- Try restarting JAN

**Diagnostic Command**:

```bash
curl http://localhost:1337/health
```

### Model Issues

**Problem**: Model not found or not loaded

**Solutions**:

- Open JAN and check if the model is downloaded
- Load the model in JAN's interface
- Verify the model name matches exactly what's in JAN (case-sensitive)
- Try using a different model

**Diagnostic Command**:

```bash
curl http://localhost:1337/v1/models
```

### Performance Issues

**Problem**: Analysis is slow or times out

**Solutions**:

- Use a smaller batch size by reducing `--max-issues`
- Ensure your computer meets the minimum requirements for the model
- Close other resource-intensive applications
- Try a smaller, more efficient model
- Add more RAM if possible

### Response Format Issues

**Problem**: Invalid or malformed LLM responses

**Solutions**:

- Try a different model that produces more consistent outputs
- Reduce the complexity of the analysis by processing fewer issues
- Update to the latest version of JAN
- Run with `--verbose` to see detailed error information

## Best Practices

1. **Model Selection**:

   - For small repositories (<100 issues): Any model should work fine
   - For medium repositories (100-500 issues): llama2 or mistral recommended
   - For large repositories (>500 issues): Use a model with larger context window

2. **Resource Management**:

   - Close other resource-intensive applications before running analysis
   - Monitor system resources during analysis
   - Use `--max-issues` to limit the number of issues processed at once

3. **Batch Processing**:

   - For very large repositories, process issues in smaller batches
   - Use specific product areas to focus analysis

4. **Quality Improvement**:
   - Different models have different strengths
   - If analysis quality is poor with one model, try another
   - Models with larger parameter counts generally provide better analysis

## Advanced Usage

### Custom Prompts

The GitHub Issue Scraper uses carefully crafted prompts to guide the LLM's analysis. Advanced users can modify these prompts by editing the prompt templates in the source code.

### Model Recommendations

| Model   | Strengths                   | Resource Requirements | Best For                           |
| ------- | --------------------------- | --------------------- | ---------------------------------- |
| llama2  | Balanced performance        | Medium                | General analysis                   |
| mistral | High-quality analysis       | Medium-High           | Detailed analysis                  |
| phi     | Fast, efficient             | Low                   | Quick analysis on limited hardware |
| llama3  | Comprehensive understanding | High                  | In-depth analysis                  |

### Detailed Model Configuration

#### Llama2

Llama2 is the default model and provides a good balance between performance and resource usage.

```bash
# Use llama2 model
github-issue-scraper -r owner/repo -p "keywords" --jan-model llama2
```

**Strengths:**

- Well-balanced for general issue analysis
- Good at identifying workarounds
- Moderate resource requirements
- Stable and reliable outputs

**Resource Requirements:**

- RAM: 8GB minimum, 16GB recommended
- CPU: 4+ cores recommended
- Disk: ~5GB for model storage

#### Mistral

Mistral provides higher quality analysis with better understanding of technical context.

```bash
# Use mistral model
github-issue-scraper -r owner/repo -p "keywords" --jan-model mistral
```

**Strengths:**

- Superior technical understanding
- Better at extracting complex workarounds
- More accurate relevance scoring
- Improved categorization of issues

**Resource Requirements:**

- RAM: 12GB minimum, 16GB+ recommended
- CPU: 6+ cores recommended
- Disk: ~7GB for model storage

#### Phi

Phi is a lightweight model ideal for systems with limited resources.

```bash
# Use phi model
github-issue-scraper -r owner/repo -p "keywords" --jan-model phi
```

**Strengths:**

- Fast analysis speed
- Low resource consumption
- Works on older hardware
- Good for quick initial analysis

**Resource Requirements:**

- RAM: 4GB minimum, 8GB recommended
- CPU: 2+ cores
- Disk: ~2GB for model storage

#### Llama3

Llama3 provides the most comprehensive analysis but requires significant resources.

```bash
# Use llama3 model
github-issue-scraper -r owner/repo -p "keywords" --jan-model llama3
```

**Strengths:**

- Most comprehensive understanding
- Best at complex technical issues
- Highest quality summaries
- Most accurate workaround extraction

**Resource Requirements:**

- RAM: 16GB minimum, 32GB recommended
- CPU: 8+ cores recommended or GPU acceleration
- Disk: ~10GB for model storage

### Performance Optimization

For optimal performance:

1. Use a computer with at least 16GB RAM
2. Ensure you have a modern CPU (or GPU for accelerated models)
3. Process repositories in smaller batches
4. Use more specific product area keywords
5. Consider using a quantized model for better performance on limited hardware

## Understanding LLM Analysis Output

The GitHub Issue Scraper uses JAN's LLM capabilities to provide rich analysis of GitHub issues. Understanding how to interpret this analysis will help you get the most value from the tool.

### Relevance Scoring

Each issue is assigned a relevance score (0-100) indicating how closely it matches your specified product area:

- **90-100**: Directly addresses core aspects of the product area
- **70-89**: Strongly related to the product area with significant impact
- **50-69**: Moderately related with some relevant aspects
- **30-49**: Tangentially related or with minor relevance
- **0-29**: Minimal or no relevance to the product area (filtered out by default)

The relevance score is calculated by the LLM based on:

- Semantic understanding of issue content
- Relationship to specified product area keywords
- Technical context and domain knowledge
- Issue metadata (labels, comments, etc.)

### Workaround Classification

The LLM identifies and classifies workarounds from issue comments:

**Author Type:**

- **Maintainer**: Solutions from project maintainers or core team members
- **Contributor**: Solutions from regular contributors or experienced users
- **User**: Solutions from general community members

**Effectiveness Rating:**

- **Confirmed**: Workaround has been verified to solve the issue
- **Suggested**: Proposed solution that may work but lacks confirmation
- **Partial**: Solution that addresses part of the issue or works in limited cases

**Confidence Score:**

- Indicates the LLM's confidence (0-100%) in the workaround's validity
- Higher scores indicate more reliable solutions

### Issue Categorization

The LLM automatically categorizes issues into meaningful groups based on:

- Root cause analysis
- Affected components
- Issue patterns and similarities
- Technical domains

These categories help identify trends and common problem areas.

### Sample LLM Analysis JSON

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

### Optimizing Analysis Quality

Different models produce different quality analysis. Here are tips for optimizing analysis quality:

1. **Model Selection**:

   - For technical repositories: mistral or llama3
   - For general repositories: llama2
   - For quick analysis: phi

2. **Product Area Specificity**:

   - More specific product areas yield more focused results
   - Use technical terms relevant to the domain
   - Include 2-3 keywords for best results

3. **Batch Size Considerations**:

   - Smaller batches (10-25 issues) often yield higher quality analysis
   - Larger batches provide more comprehensive coverage
   - Balance based on your specific needs

4. **Analysis Interpretation**:
   - Focus on issues with relevance scores above 70 for most relevant results
   - Consider workarounds with confidence scores above 80 most reliable
   - Look for patterns in automatically generated categories

## Feedback and Support

If you encounter issues with JAN integration:

1. Check this troubleshooting guide
2. Visit the JAN community: https://jan.ai/discord
3. Report issues on the GitHub Issue Scraper repository
