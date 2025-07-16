# Design Document

## Overview

The GitHub Issue Scraper is a command-line tool that combines GitHub API integration with intelligent filtering to extract and summarize relevant issues from specified repositories. The tool uses GitHub's REST API for efficient data retrieval, implements smart relevance scoring for product area filtering, and generates comprehensive markdown reports with issue summaries and extracted workarounds.

## Architecture

The system follows a modular architecture with clear separation of concerns:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CLI Interface │────│  Core Engine    │────│  GitHub Client  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                    ┌─────────┼─────────┐
                    │         │         │
            ┌───────▼───┐ ┌───▼────┐ ┌──▼──────┐
            │ Relevance │ │ Issue  │ │ Report  │
            │ Filter    │ │ Parser │ │ Gen.    │
            └───────────┘ └────────┘ └─────────┘
```

## Components and Interfaces

### 1. CLI Interface

- **Purpose**: Handle user input and configuration
- **Key Methods**:
  - `parseArguments()`: Process command line arguments
  - `validateInputs()`: Ensure repository URL and product area are valid
  - `setupAuthentication()`: Guide user through GitHub token setup

### 2. GitHub Client

- **Purpose**: Handle all GitHub API interactions
- **Key Methods**:
  - `authenticate(token)`: Establish authenticated session
  - `getRepositoryIssues(repo, filters)`: Fetch issues with pagination
  - `getIssueComments(issueNumber)`: Retrieve all comments for an issue
  - `handleRateLimit()`: Implement exponential backoff for rate limiting

### 3. Relevance Filter

- **Purpose**: Determine issue relevance to specified product area
- **Key Methods**:
  - `scoreRelevance(issue, productArea)`: Calculate relevance score (0-100)
  - `extractKeywords(productArea)`: Parse product area into searchable terms
  - `fuzzyMatch(text, keywords)`: Perform fuzzy string matching

### 4. Issue Parser

- **Purpose**: Extract and structure information from issues
- **Key Methods**:
  - `parseIssueContent(issue)`: Extract title, description, labels, metadata
  - `extractWorkarounds(comments)`: Identify solution attempts in comments
  - `generateSummary(issue)`: Create executive summary using key information

### 5. Report Generator

- **Purpose**: Create formatted markdown output
- **Key Methods**:
  - `generateReport(issues, metadata)`: Create complete markdown document
  - `formatIssue(issue)`: Format individual issue section
  - `createTableOfContents()`: Generate navigation structure

## Data Models

### Issue Model

```typescript
interface GitHubIssue {
  id: number;
  title: string;
  description: string;
  labels: string[];
  state: "open" | "closed";
  createdAt: Date;
  updatedAt: Date;
  author: string;
  url: string;
  comments: Comment[];
  relevanceScore: number;
  summary: string;
  workarounds: Workaround[];
}
```

### Comment Model

```typescript
interface Comment {
  id: number;
  author: string;
  body: string;
  createdAt: Date;
  isWorkaround: boolean;
  authorType: "maintainer" | "contributor" | "user";
}
```

### Workaround Model

```typescript
interface Workaround {
  description: string;
  author: string;
  authorType: "maintainer" | "contributor" | "user";
  commentId: number;
  effectiveness: "confirmed" | "suggested" | "partial";
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
}
```

## Error Handling

### Authentication Errors

- **Token Missing**: Prompt user to create GitHub personal access token
- **Token Invalid**: Clear instructions for token regeneration
- **Insufficient Permissions**: Specific guidance on required scopes

### API Errors

- **Rate Limiting**: Automatic retry with exponential backoff (max 5 attempts)
- **Repository Not Found**: Validate repository URL format and existence
- **Network Errors**: Retry mechanism with user notification

### Data Processing Errors

- **Malformed Issues**: Skip problematic issues with logging
- **Empty Results**: Inform user and suggest broader search criteria
- **File System Errors**: Handle permission issues and disk space

## Testing Strategy

### Unit Tests

- **GitHub Client**: Mock API responses for various scenarios
- **Relevance Filter**: Test scoring algorithm with known issue sets
- **Issue Parser**: Validate extraction accuracy with sample issues
- **Report Generator**: Verify markdown formatting and structure

### Integration Tests

- **End-to-End Flow**: Test complete workflow with test repository
- **Authentication Flow**: Verify token setup and validation
- **Error Scenarios**: Test rate limiting, network failures, invalid inputs

### Performance Tests

- **Large Repository Handling**: Test with repositories having 1000+ issues
- **Memory Usage**: Monitor memory consumption during processing
- **Rate Limit Compliance**: Verify API usage stays within limits

## Implementation Notes

### Relevance Scoring Algorithm

The relevance filter uses a weighted scoring system:

- **Title Match**: 40% weight - exact/partial matches in issue title
- **Label Match**: 30% weight - product area keywords in labels
- **Description Match**: 20% weight - keyword density in description
- **Comment Activity**: 10% weight - recent activity indicates current relevance

### Workaround Detection

Comments are analyzed for workaround indicators:

- **Pattern Matching**: Look for phrases like "workaround", "fix", "solution"
- **Code Blocks**: Identify comments containing code snippets
- **Author Authority**: Weight responses from maintainers higher
- **Community Validation**: Consider upvotes/reactions on comments

### Output Format

The generated markdown follows this structure:

```markdown
# GitHub Issues Report: {repo-name} - {product-area}

## Summary

- Total Issues Analyzed: X
- Relevant Issues Found: Y
- Report Generated: {timestamp}

## Issues

### Issue #123: {title}

**Labels**: {labels}
**Created**: {date} by {author}
**Relevance Score**: {score}/100

#### Summary

{executive summary}

#### Workarounds

1. **{author-type}**: {workaround description}
2. **{author-type}**: {workaround description}

---
```
