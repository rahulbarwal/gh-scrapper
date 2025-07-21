# Design Document

## Overview

The GitHub Issue Scraper is a command-line tool that combines GitHub API integration with local LLM analysis via JAN application to extract and summarize relevant issues from specified repositories. The tool uses GitHub's REST API for efficient data retrieval, delegates all analysis and scoring to a locally running LLM through JAN's OpenAI-compatible API, and generates comprehensive markdown reports based on intelligent natural language understanding of issue content and context.

## Architecture

The system follows a modular architecture with LLM-powered analysis as the core intelligence layer:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CLI Interface │────│  Core Engine    │────│  GitHub Client  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │    JAN Client     │
                    │  (LLM Analysis)   │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │  Report Generator │
                    │  (Format Output)  │
                    └───────────────────┘
```

## Components and Interfaces

### 1. CLI Interface

- **Purpose**: Handle user input and configuration
- **Key Methods**:
  - `parseArguments()`: Process command line arguments
  - `validateInputs()`: Ensure repository URL and product area are valid
  - `setupAuthentication()`: Guide user through GitHub token and JAN setup

### 2. GitHub Client

- **Purpose**: Handle all GitHub API interactions
- **Key Methods**:
  - `authenticate(token)`: Establish authenticated session
  - `getRepositoryIssues(repo)`: Fetch all issues with pagination (no filtering)
  - `getIssueComments(issueNumber)`: Retrieve all comments for an issue
  - `handleRateLimit()`: Implement exponential backoff for rate limiting

### 3. JAN Client

- **Purpose**: Interface with JAN's local LLM server for all analysis tasks
- **Key Methods**:
  - `analyzeIssues(issues, productArea)`: Send batch of issues to JAN's OpenAI-compatible API
  - `parseStructuredResponse(response)`: Extract structured data from LLM output
  - `validateConnection()`: Verify JAN server is running and accessible
  - `handleLLMErrors()`: Manage JAN API errors and retries

### 4. LLM Prompt Manager

- **Purpose**: Construct and manage prompts for different analysis tasks
- **Key Methods**:
  - `buildAnalysisPrompt(issues, productArea)`: Create comprehensive analysis prompt
  - `buildScoringPrompt(issue, context)`: Create relevance scoring prompt
  - `buildSummaryPrompt(issue)`: Create issue summarization prompt
  - `formatIssueData(issue)`: Structure issue data for LLM consumption

### 5. Report Generator

- **Purpose**: Create formatted markdown output from LLM analysis
- **Key Methods**:
  - `generateReport(llmAnalysis, metadata)`: Create complete markdown document from LLM output
  - `formatLLMResults(analysis)`: Format LLM analysis into readable sections
  - `createTableOfContents()`: Generate navigation structure

## Data Models

### Raw GitHub Issue Model

```typescript
interface RawGitHubIssue {
  id: number;
  title: string;
  body: string;
  labels: string[];
  state: "open" | "closed";
  created_at: string;
  updated_at: string;
  user: { login: string };
  html_url: string;
  comments: RawComment[];
}
```

### Raw Comment Model

```typescript
interface RawComment {
  id: number;
  user: { login: string };
  body: string;
  created_at: string;
  author_association: string;
}
```

### LLM Analysis Response Model

```typescript
interface LLMAnalysisResponse {
  relevantIssues: AnalyzedIssue[];
  summary: {
    totalAnalyzed: number;
    relevantFound: number;
    topCategories: string[];
    analysisModel: string;
  };
}
```

### Analyzed Issue Model

```typescript
interface AnalyzedIssue {
  id: number;
  title: string;
  relevanceScore: number;
  category: string;
  priority: "high" | "medium" | "low";
  summary: string;
  workarounds: LLMWorkaround[];
  tags: string[];
  sentiment: "positive" | "neutral" | "negative";
}
```

### LLM Workaround Model

```typescript
interface LLMWorkaround {
  description: string;
  author: string;
  authorType: "maintainer" | "contributor" | "user";
  effectiveness: "confirmed" | "suggested" | "partial";
  confidence: number;
}
```

### Configuration Model

```typescript
interface Config {
  githubToken: string;
  repository: string;
  productArea: string;
  maxIssues: number;
  minRelevanceScore: number;
  outputPath: string;
  janEndpoint: string;
  janModel: string;
}
```

## Error Handling

### GitHub Authentication Errors

- **Token Missing**: Prompt user to create GitHub personal access token
- **Token Invalid**: Clear instructions for token regeneration
- **Insufficient Permissions**: Specific guidance on required scopes
- **Rate Limiting**: Automatic retry with exponential backoff (max 5 attempts)
- **Repository Not Found**: Validate repository URL format and existence

### JAN Integration Errors

- **Service Unavailable**: Check if JAN application is running and provide startup instructions
- **Model Not Loaded**: Guide user to load required model in JAN interface
- **Connection Timeout**: Implement retry logic with increasing timeouts
- **Invalid Response Format**: Parse and validate LLM responses with fallback handling
- **Context Length Exceeded**: Implement issue batching for large datasets
- **API Key Issues**: Handle JAN's OpenAI-compatible authentication if configured

### LLM Response Errors

- **Malformed JSON**: Retry with clearer prompt structure and validation
- **Missing Required Fields**: Request re-analysis with specific field requirements
- **Inconsistent Scoring**: Validate score ranges and request corrections
- **Empty Analysis**: Handle cases where LLM returns no relevant results

### System Errors

- **Network Errors**: Retry mechanism with user notification for both GitHub and Ollama
- **File System Errors**: Handle permission issues and disk space
- **Memory Errors**: Implement batching for large issue sets

## Testing Strategy

### Unit Tests

- **GitHub Client**: Mock API responses for various scenarios
- **JAN Client**: Mock LLM responses with various analysis formats
- **Prompt Manager**: Test prompt construction and formatting
- **Report Generator**: Verify markdown formatting from LLM analysis

### Integration Tests

- **End-to-End Flow**: Test complete workflow with test repository and local JAN
- **GitHub Authentication**: Verify token setup and validation
- **JAN Integration**: Test LLM connectivity and response parsing
- **Error Scenarios**: Test rate limiting, network failures, JAN unavailability

### LLM Testing

- **Response Validation**: Test parsing of various LLM response formats
- **Prompt Effectiveness**: Validate that prompts produce expected analysis quality
- **Batch Processing**: Test handling of multiple issues in single LLM requests
- **Model Compatibility**: Test with different models available in JAN (llama2, mistral, etc.)

### Performance Tests

- **Large Repository Handling**: Test with repositories having 1000+ issues
- **LLM Response Times**: Monitor analysis duration for different batch sizes
- **Memory Usage**: Monitor memory consumption during LLM processing
- **Rate Limit Compliance**: Verify GitHub API usage stays within limits

## Implementation Notes

### LLM Analysis Workflow

The system delegates all analysis to the LLM through structured prompts:

1. **Data Preparation**: Raw GitHub issues and comments are formatted into structured JSON
2. **Prompt Construction**: Context-aware prompts include product area, analysis requirements, and output format specifications
3. **Batch Processing**: Issues are processed in batches to optimize LLM performance and manage context limits
4. **Response Parsing**: LLM responses are validated and parsed into structured data models
5. **Error Recovery**: Failed analyses are retried with modified prompts or smaller batches

### Prompt Engineering Strategy

- **System Prompt**: Establishes LLM role as GitHub issue analyst with specific expertise
- **Context Injection**: Product area and analysis goals are clearly specified
- **Output Format**: JSON schema is provided to ensure consistent structured responses
- **Examples**: Few-shot examples guide the LLM toward desired analysis quality
- **Validation**: Response format requirements are explicitly stated

### JAN Integration

- **OpenAI Compatibility**: Use JAN's OpenAI-compatible API endpoint for seamless integration
- **Model Selection**: Configure model selection through JAN's available models
- **Endpoint Configuration**: Support for custom JAN endpoints (default: `http://localhost:1337`)
- **Context Management**: Handle context length limits through intelligent batching
- **Streaming**: Optional streaming responses for real-time feedback on long analyses
- **Model Validation**: Verify model is loaded and available in JAN before starting analysis

### Output Format

The generated markdown follows this LLM-driven structure:

```markdown
# GitHub Issues Report: {repo-name} - {product-area}

## Analysis Summary

- Total Issues Analyzed: X
- Relevant Issues Found: Y
- Analysis Model: {jan-model}
- Report Generated: {timestamp}
- Top Categories: {llm-identified-categories}

## Issues by Priority

### High Priority Issues

#### Issue #123: {llm-generated-title}

**LLM Analysis**: {llm-summary}
**Relevance Score**: {llm-score}/100
**Category**: {llm-category}
**Sentiment**: {llm-sentiment}

##### Identified Workarounds

1. **{author-type}** (Confidence: {llm-confidence}%): {llm-extracted-workaround}
2. **{author-type}** (Confidence: {llm-confidence}%): {llm-extracted-workaround}

---
```
