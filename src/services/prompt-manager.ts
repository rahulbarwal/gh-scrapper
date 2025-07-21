import {
  JANMessage,
  RawGitHubIssue,
  RawComment,
  LLMAnalysisResponse,
  AnalyzedIssue,
  LLMWorkaround,
} from "../models";

/**
 * Prompt Manager Service
 *
 * Handles creation and management of prompts for LLM analysis of GitHub issues.
 * Provides templates, schema specifications, and few-shot examples.
 */
export class PromptManager {
  /**
   * Creates a system prompt for GitHub issue analysis
   *
   * @returns System prompt message
   */
  createSystemPrompt(): JANMessage {
    return {
      role: "system",
      content: `You are an expert GitHub issue analyst specializing in identifying relevant issues, extracting workarounds, and providing structured analysis. 
Your task is to analyze GitHub issues and their comments to:
1. Determine relevance to a specified product area
2. Extract and summarize key information
3. Identify workarounds mentioned in comments
4. Categorize and prioritize issues
5. Provide sentiment analysis

Respond with structured JSON following the exact schema provided. Be precise, thorough, and focus on extracting actionable insights.`,
    };
  }

  /**
   * Creates a JSON schema specification for LLM responses
   *
   * @returns JSON schema as a string
   */
  createResponseSchema(): string {
    return `{
  "type": "object",
  "required": ["relevantIssues", "summary"],
  "properties": {
    "relevantIssues": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "title", "relevanceScore", "category", "priority", "summary", "workarounds", "tags", "sentiment"],
        "properties": {
          "id": { "type": "number" },
          "title": { "type": "string" },
          "relevanceScore": { "type": "number", "minimum": 0, "maximum": 100 },
          "category": { "type": "string" },
          "priority": { "type": "string", "enum": ["high", "medium", "low"] },
          "summary": { "type": "string" },
          "workarounds": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["description", "author", "authorType", "effectiveness", "confidence"],
              "properties": {
                "description": { "type": "string" },
                "author": { "type": "string" },
                "authorType": { "type": "string", "enum": ["maintainer", "contributor", "user"] },
                "effectiveness": { "type": "string", "enum": ["confirmed", "suggested", "partial"] },
                "confidence": { "type": "number", "minimum": 0, "maximum": 100 }
              }
            }
          },
          "tags": { "type": "array", "items": { "type": "string" } },
          "sentiment": { "type": "string", "enum": ["positive", "neutral", "negative"] }
        }
      }
    },
    "summary": {
      "type": "object",
      "required": ["totalAnalyzed", "relevantFound", "topCategories", "analysisModel"],
      "properties": {
        "totalAnalyzed": { "type": "number" },
        "relevantFound": { "type": "number" },
        "topCategories": { "type": "array", "items": { "type": "string" } },
        "analysisModel": { "type": "string" }
      }
    }
  }
}`;
  }

  /**
   * Formats a GitHub issue for LLM consumption
   *
   * @param issue Raw GitHub issue
   * @param comments Comments for the issue
   * @returns Formatted issue as a string
   */
  formatIssueData(issue: RawGitHubIssue, comments: RawComment[] = []): string {
    const formattedComments = comments
      .map((comment) => {
        return `
COMMENT BY: ${comment.user.login} (${comment.author_association})
DATE: ${comment.created_at}
${comment.body}
`;
      })
      .join("\n---\n");

    return `
ISSUE #${issue.number} (ID: ${issue.id})
TITLE: ${issue.title}
AUTHOR: ${issue.user.login}
STATE: ${issue.state}
CREATED: ${issue.created_at}
UPDATED: ${issue.updated_at}
URL: ${issue.html_url}
LABELS: ${issue.labels.map((label) => label.name).join(", ")}

DESCRIPTION:
${issue.body || "No description provided"}

${
  comments.length > 0
    ? `COMMENTS (${comments.length}):
---
${formattedComments}`
    : "NO COMMENTS"
}
`;
  }

  /**
   * Creates a prompt for analyzing a batch of GitHub issues
   *
   * @param issues Array of raw GitHub issues
   * @param comments Map of issue ID to comments
   * @param productArea Product area for relevance filtering
   * @returns Array of messages for the LLM
   */
  buildAnalysisPrompt(
    issues: RawGitHubIssue[],
    comments: Map<number, RawComment[]>,
    productArea: string
  ): JANMessage[] {
    // Start with the system prompt
    const messages: JANMessage[] = [this.createSystemPrompt()];

    // Add the user prompt with context and instructions
    const userPrompt = {
      role: "user" as const,
      content: `I need you to analyze the following GitHub issues for the product area: "${productArea}".

For each issue, determine:
1. If it's relevant to the product area "${productArea}" (score 0-100)
2. A concise summary of the issue
3. Any workarounds mentioned in comments
4. The appropriate category and priority
5. Sentiment analysis (positive, neutral, negative)

Only include issues with a relevance score above 50 in your response.

Here are the issues to analyze:

${issues
  .map((issue) => {
    const issueComments = comments.get(issue.id) || [];
    return this.formatIssueData(issue, issueComments);
  })
  .join("\n\n==========\n\n")}

Respond with a JSON object that strictly follows this schema:
${this.createResponseSchema()}

Include only the JSON in your response, with no additional text or explanations.`,
    };

    messages.push(userPrompt);

    return messages;
  }

  /**
   * Creates a prompt for scoring a single GitHub issue's relevance
   *
   * @param issue Raw GitHub issue
   * @param comments Comments for the issue
   * @param productArea Product area for relevance scoring
   * @returns Array of messages for the LLM
   */
  buildScoringPrompt(
    issue: RawGitHubIssue,
    comments: RawComment[],
    productArea: string
  ): JANMessage[] {
    return [
      {
        role: "system",
        content: `You are an expert at determining the relevance of GitHub issues to specific product areas. Score issues on a scale of 0-100 based on how relevant they are to the specified product area.`,
      },
      {
        role: "user",
        content: `Please score the following GitHub issue for relevance to the product area: "${productArea}".
Use a scale of 0-100 where:
- 0-20: Not relevant at all
- 21-40: Slightly relevant
- 41-60: Moderately relevant
- 61-80: Very relevant
- 81-100: Extremely relevant

${this.formatIssueData(issue, comments)}

Respond with a JSON object containing only the relevance score:
{
  "relevanceScore": number
}

Include only the JSON in your response, with no additional text.`,
      },
    ];
  }

  /**
   * Creates a prompt for extracting workarounds from issue comments
   *
   * @param issue Raw GitHub issue
   * @param comments Comments for the issue
   * @returns Array of messages for the LLM
   */
  buildWorkaroundExtractionPrompt(
    issue: RawGitHubIssue,
    comments: RawComment[]
  ): JANMessage[] {
    return [
      {
        role: "system",
        content: `You are an expert at identifying workarounds and solutions in GitHub issue comments. Extract any workarounds mentioned, who suggested them, and how effective they appear to be.`,
      },
      {
        role: "user",
        content: `Please analyze the following GitHub issue and its comments to extract any workarounds or solutions mentioned:

${this.formatIssueData(issue, comments)}

Respond with a JSON array of workarounds following this format:
{
  "workarounds": [
    {
      "description": "Clear description of the workaround",
      "author": "GitHub username of who suggested it",
      "authorType": "maintainer|contributor|user",
      "effectiveness": "confirmed|suggested|partial",
      "confidence": number (0-100)
    }
  ]
}

If no workarounds are found, return an empty array. Include only the JSON in your response, with no additional text.`,
      },
    ];
  }

  /**
   * Creates a prompt for summarizing a GitHub issue
   *
   * @param issue Raw GitHub issue
   * @param comments Comments for the issue
   * @returns Array of messages for the LLM
   */
  buildSummaryPrompt(
    issue: RawGitHubIssue,
    comments: RawComment[]
  ): JANMessage[] {
    return [
      {
        role: "system",
        content: `You are an expert at summarizing GitHub issues concisely while preserving key information. Create clear, informative summaries that capture the essence of the issue.`,
      },
      {
        role: "user",
        content: `Please create a concise summary of the following GitHub issue:

${this.formatIssueData(issue, comments)}

Respond with a JSON object containing the summary:
{
  "summary": "Your concise summary here"
}

The summary should be 1-3 sentences that capture the core problem, any key context, and status if resolved. Include only the JSON in your response, with no additional text.`,
      },
    ];
  }

  /**
   * Creates a few-shot example for issue analysis
   *
   * @returns Few-shot example as a JANMessage
   */
  createFewShotExample(): JANMessage {
    return {
      role: "assistant",
      content: JSON.stringify(
        {
          relevantIssues: [
            {
              id: 12345,
              title: "App crashes when uploading large images",
              relevanceScore: 85,
              category: "Performance",
              priority: "high",
              summary:
                "The application crashes when users attempt to upload images larger than 10MB due to memory allocation issues in the image processing module.",
              workarounds: [
                {
                  description:
                    "Resize images to under 10MB before uploading using an external tool",
                  author: "user123",
                  authorType: "user",
                  effectiveness: "confirmed",
                  confidence: 90,
                },
                {
                  description:
                    "Use the desktop app instead of the web interface for large uploads",
                  author: "maintainer42",
                  authorType: "maintainer",
                  effectiveness: "suggested",
                  confidence: 75,
                },
              ],
              tags: ["crash", "upload", "images", "memory-issue"],
              sentiment: "negative",
            },
          ],
          summary: {
            totalAnalyzed: 1,
            relevantFound: 1,
            topCategories: ["Performance"],
            analysisModel: "llama2",
          },
        },
        null,
        2
      ),
    };
  }

  /**
   * Creates a batch processing prompt for multiple issues
   *
   * @param issues Array of raw GitHub issues
   * @param comments Map of issue ID to comments
   * @param productArea Product area for relevance filtering
   * @param batchSize Number of issues per batch
   * @returns Array of batch prompts, each containing a subset of issues
   */
  createBatchPrompts(
    issues: RawGitHubIssue[],
    comments: Map<number, RawComment[]>,
    productArea: string,
    batchSize: number = 5
  ): JANMessage[][] {
    const batches: JANMessage[][] = [];

    // Split issues into batches
    for (let i = 0; i < issues.length; i += batchSize) {
      const batchIssues = issues.slice(i, i + batchSize);
      batches.push(
        this.buildAnalysisPrompt(batchIssues, comments, productArea)
      );
    }

    return batches;
  }

  /**
   * Parses and validates LLM response
   *
   * @param response String response from LLM
   * @returns Parsed LLMAnalysisResponse or null if invalid
   */
  parseStructuredResponse(response: string): LLMAnalysisResponse | null {
    try {
      // Extract JSON from response (in case LLM included other text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      const jsonStr = jsonMatch[0];
      const parsed = JSON.parse(jsonStr) as LLMAnalysisResponse;

      // Basic validation
      if (
        !parsed.relevantIssues ||
        !Array.isArray(parsed.relevantIssues) ||
        !parsed.summary
      ) {
        return null;
      }

      return parsed;
    } catch (error) {
      return null;
    }
  }
}
