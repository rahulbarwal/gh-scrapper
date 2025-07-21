# Implementation Plan

- [x] 1. Remove existing manual analysis logic and update project structure

  - Remove relevance-filter.ts service and all manual scoring algorithms
  - Remove issue-parser.ts manual workaround extraction logic
  - Update TypeScript interfaces to support raw GitHub data and LLM analysis responses
  - Add OpenAI SDK dependency for JAN's OpenAI-compatible API integration
  - _Requirements: 6.1, 6.2_

- [ ] 2. Implement JAN client service

  - Create JAN client service using OpenAI SDK for API communication
  - Implement connection validation to verify JAN server availability
  - Add model validation to ensure selected model is loaded in JAN
  - Create error handling for JAN-specific scenarios (service unavailable, model not loaded)
  - Configure default endpoint (http://localhost:1337) with override options
  - _Requirements: 3.3, 6.1, 6.5_

- [ ] 3. Build LLM prompt management system

  - Create prompt templates for issue analysis with structured output requirements
  - Implement prompt construction methods that include product area context
  - Design JSON schema specifications for consistent LLM response format
  - Add few-shot examples to guide LLM toward desired analysis quality
  - Create batch processing prompts for handling multiple issues efficiently
  - _Requirements: 6.2, 2.1, 2.3_

- [ ] 4. Integrate LLM analysis into core workflow

  - Update GitHub client to retrieve all issues without manual filtering
  - Modify core engine to pass raw issue data to JAN for analysis
  - Implement structured response parsing and validation from LLM output
  - Add batch processing logic to handle large issue sets within context limits
  - Create fallback handling for malformed or incomplete LLM responses
  - _Requirements: 1.3, 1.4, 6.3, 6.4_

- [ ] 5. Update report generation for LLM-driven output

  - Modify report generator to use LLM analysis results instead of manual parsing
  - Implement formatting for LLM-generated summaries, scores, and categorizations
  - Add display of LLM confidence levels and analysis metadata
  - Create sections for LLM-identified workarounds with effectiveness ratings
  - Update report metadata to include analysis model and processing statistics
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 6. Update configuration system for JAN integration

  - Add JAN endpoint and model configuration options
  - Implement JAN connectivity testing in setup process
  - Create configuration validation for JAN-specific settings
  - Add CLI prompts for JAN setup and model selection
  - Update environment variable handling for JAN configuration
  - _Requirements: 3.3, 6.5_

- [ ] 7. Implement comprehensive error handling for LLM integration

  - Add specific error handling for JAN service unavailability
  - Implement retry logic for LLM API failures with exponential backoff
  - Create user-friendly error messages for common JAN setup issues
  - Add validation for LLM response format and required fields
  - Implement graceful degradation when LLM analysis fails
  - _Requirements: 3.5, 6.5_

- [ ] 8. Update unit tests for LLM-based architecture

  - Remove tests for manual scoring and analysis algorithms
  - Create mock JAN client responses for various analysis scenarios
  - Write tests for prompt construction and formatting
  - Implement tests for LLM response parsing and validation
  - Add tests for batch processing and context management
  - _Requirements: 6.1, 6.3, 6.4_

- [ ] 9. Build integration tests for JAN workflow

  - Create end-to-end tests with mock JAN server responses
  - Implement tests for JAN connectivity and error scenarios
  - Add tests for large repository processing with LLM batching
  - Create tests for various LLM response formats and edge cases
  - Write performance tests for LLM analysis duration and memory usage
  - _Requirements: 1.4, 3.3, 6.5_

- [ ] 10. Update CLI interface and documentation

  - Update help text and usage examples to reflect LLM-powered analysis
  - Add JAN setup instructions and troubleshooting guide
  - Create documentation for configuring different models in JAN
  - Update README with JAN installation and configuration steps
  - Add examples of LLM analysis output and interpretation
  - _Requirements: 1.5, 3.5, 4.4_
