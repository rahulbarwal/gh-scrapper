# Requirements Document

## Introduction

This feature provides a tool for scraping GitHub issues within specific repositories and product areas to identify relevant problems and extract key information using local LLM analysis via JAN application. The tool will authenticate with GitHub, retrieve repository issues, delegate all analysis and scoring to a locally running LLM through JAN's OpenAI-compatible API, and generate comprehensive summaries including workarounds and key details based on the LLM's analysis of issue descriptions and comments.

## Requirements

### Requirement 1

**User Story:** As a product manager, I want to scrape GitHub issues for a specific repository and product area, so that I can quickly understand the current problems and pain points users are experiencing through LLM-powered analysis.

#### Acceptance Criteria

1. WHEN the user provides a GitHub repository URL and product area THEN the system SHALL authenticate with GitHub using proper access tokens
2. WHEN authentication is successful THEN the system SHALL retrieve all issues from the repository's issues section
3. WHEN issues are retrieved THEN the system SHALL pass the raw issue data to the local JAN LLM for analysis
4. WHEN the LLM completes analysis THEN the system SHALL receive structured analysis results including relevance scores and extracted information
5. WHEN analysis is complete THEN the system SHALL generate a markdown file named after the repository and product area based on LLM output

### Requirement 2

**User Story:** As a developer, I want the LLM to analyze and extract comprehensive information from each issue, so that I can understand the full context and any available solutions through intelligent analysis.

#### Acceptance Criteria

1. WHEN the LLM receives issue data THEN it SHALL analyze the issue title, description, labels, comments, and metadata
2. WHEN the LLM processes issue comments THEN it SHALL identify and extract workarounds provided by users or developers using natural language understanding
3. WHEN the LLM analyzes issue content THEN it SHALL generate an executive summary for each issue based on its understanding
4. WHEN the LLM identifies multiple workarounds THEN it SHALL categorize and rank them with source attribution and effectiveness assessment
5. WHEN the LLM completes issue analysis THEN it SHALL provide priority indicators and relevance scores based on comprehensive content analysis

### Requirement 3

**User Story:** As a researcher, I want the tool to properly authenticate with GitHub and communicate with Ollama, so that I can reliably scrape issues and get LLM analysis without encountering access errors.

#### Acceptance Criteria

1. WHEN the tool is first configured THEN the system SHALL prompt for and securely store GitHub authentication tokens
2. WHEN making GitHub API requests THEN the system SHALL respect rate limits and implement appropriate backoff strategies
3. WHEN connecting to JAN THEN the system SHALL verify the local LLM service is running and accessible
4. WHEN authentication fails THEN the system SHALL provide clear error messages and guidance for token setup
5. WHEN JAN is unavailable THEN the system SHALL inform the user and provide setup instructions for the local LLM service

### Requirement 4

**User Story:** As a user, I want the output to be well-structured and easily readable based on LLM analysis, so that I can quickly scan through the findings and identify the most important issues.

#### Acceptance Criteria

1. WHEN generating the output file THEN the system SHALL create a markdown file with clear section headers based on LLM-provided structure
2. WHEN organizing issues THEN the system SHALL sort them by LLM-calculated relevance scores and priority rankings
3. WHEN presenting each issue THEN the system SHALL use LLM-generated summaries, categorizations, and formatting recommendations
4. WHEN workarounds are available THEN the system SHALL present LLM-identified and categorized solutions with effectiveness ratings
5. WHEN the file is generated THEN the system SHALL include metadata such as scrape date, repository info, LLM model used, and analysis statistics

### Requirement 5

**User Story:** As a user, I want to specify the product area or topic of interest, so that the LLM can intelligently filter and analyze issues relevant to my research needs.

#### Acceptance Criteria

1. WHEN specifying a product area THEN the system SHALL pass keywords, labels, or topic descriptions to the LLM as context
2. WHEN the LLM analyzes issues THEN it SHALL determine relevance using natural language understanding of the product area context
3. WHEN relevance is ambiguous THEN the LLM SHALL use its understanding of context and semantics to make intelligent relevance decisions
4. WHEN the LLM finds no relevant issues THEN it SHALL provide explanations and suggest alternative search approaches
5. WHEN the LLM identifies many relevant issues THEN it SHALL rank and prioritize them based on relevance and importance with configurable result limits

### Requirement 6

**User Story:** As a developer, I want all analysis and scoring to be performed by the local LLM via JAN application, so that the system leverages advanced natural language understanding instead of manual algorithms.

#### Acceptance Criteria

1. WHEN the system needs to analyze issue content THEN it SHALL send raw issue data to JAN's OpenAI-compatible API endpoint
2. WHEN communicating with JAN THEN the system SHALL format requests with appropriate prompts for issue analysis tasks
3. WHEN the LLM processes requests THEN it SHALL return structured responses containing scores, summaries, and extracted information
4. WHEN receiving LLM responses THEN the system SHALL parse and validate the structured output before using it
5. WHEN JAN is unavailable or returns errors THEN the system SHALL handle failures gracefully with appropriate error messages and retry logic
