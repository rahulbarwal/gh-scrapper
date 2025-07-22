import { PromptManager } from "../prompt-manager";
import { LLMAnalysisResponse } from "../../models";

describe("LLM Response Parsing and Validation", () => {
  let promptManager: PromptManager;

  beforeEach(() => {
    promptManager = new PromptManager();
  });

  describe("Valid Response Parsing", () => {
    test("should parse valid JSON response", () => {
      const validResponse = JSON.stringify({
        relevantIssues: [
          {
            id: 12345,
            title: "App crashes when uploading large images",
            relevanceScore: 85,
            category: "Performance",
            priority: "high",
            summary:
              "The application crashes when users attempt to upload images larger than 10MB.",
            workarounds: [
              {
                description: "Resize images to under 10MB before uploading",
                author: "maintainer",
                authorType: "maintainer",
                effectiveness: "confirmed",
                confidence: 90,
              },
            ],
            tags: ["crash", "upload", "images"],
            sentiment: "negative",
          },
        ],
        summary: {
          totalAnalyzed: 1,
          relevantFound: 1,
          topCategories: ["Performance"],
          analysisModel: "llama2",
        },
      });

      const result = promptManager.parseStructuredResponse(validResponse);

      expect(result).not.toBeNull();
      expect(result?.relevantIssues).toHaveLength(1);
      expect(result?.relevantIssues[0].id).toBe(12345);
      expect(result?.relevantIssues[0].title).toBe(
        "App crashes when uploading large images"
      );
      expect(result?.relevantIssues[0].relevanceScore).toBe(85);
      expect(result?.relevantIssues[0].workarounds).toHaveLength(1);
      expect(result?.summary.totalAnalyzed).toBe(1);
    });

    test("should parse response with multiple issues", () => {
      const validResponse = JSON.stringify({
        relevantIssues: [
          {
            id: 12345,
            title: "Issue 1",
            relevanceScore: 85,
            category: "Bug",
            priority: "high",
            summary: "Summary 1",
            workarounds: [],
            tags: ["bug"],
            sentiment: "negative",
          },
          {
            id: 12346,
            title: "Issue 2",
            relevanceScore: 75,
            category: "Feature",
            priority: "medium",
            summary: "Summary 2",
            workarounds: [],
            tags: ["feature"],
            sentiment: "positive",
          },
        ],
        summary: {
          totalAnalyzed: 2,
          relevantFound: 2,
          topCategories: ["Bug", "Feature"],
          analysisModel: "llama2",
        },
      });

      const result = promptManager.parseStructuredResponse(validResponse);

      expect(result).not.toBeNull();
      expect(result?.relevantIssues).toHaveLength(2);
      expect(result?.relevantIssues[0].id).toBe(12345);
      expect(result?.relevantIssues[1].id).toBe(12346);
      expect(result?.summary.relevantFound).toBe(2);
    });

    test("should parse response with empty relevant issues", () => {
      const validResponse = JSON.stringify({
        relevantIssues: [],
        summary: {
          totalAnalyzed: 5,
          relevantFound: 0,
          topCategories: [],
          analysisModel: "llama2",
        },
      });

      const result = promptManager.parseStructuredResponse(validResponse);

      expect(result).not.toBeNull();
      expect(result?.relevantIssues).toHaveLength(0);
      expect(result?.summary.totalAnalyzed).toBe(5);
      expect(result?.summary.relevantFound).toBe(0);
    });

    test("should extract JSON from response with additional text", () => {
      const responseWithText = `
I've analyzed the GitHub issues and here's what I found:

{
  "relevantIssues": [
    {
      "id": 12345,
      "title": "App crashes when uploading large images",
      "relevanceScore": 85,
      "category": "Performance",
      "priority": "high",
      "summary": "The application crashes when users attempt to upload images larger than 10MB.",
      "workarounds": [],
      "tags": ["crash", "upload", "images"],
      "sentiment": "negative"
    }
  ],
  "summary": {
    "totalAnalyzed": 1,
    "relevantFound": 1,
    "topCategories": ["Performance"],
    "analysisModel": "llama2"
  }
}

I hope this analysis helps!
      `;

      const result = promptManager.parseStructuredResponse(responseWithText);

      expect(result).not.toBeNull();
      expect(result?.relevantIssues).toHaveLength(1);
      expect(result?.relevantIssues[0].id).toBe(12345);
    });

    test("should parse response with complex nested structures", () => {
      const complexResponse = JSON.stringify({
        relevantIssues: [
          {
            id: 12345,
            title: "Complex issue",
            relevanceScore: 90,
            category: "Bug",
            priority: "high",
            summary: "A complex issue with multiple workarounds",
            workarounds: [
              {
                description: "Workaround 1",
                author: "user1",
                authorType: "user",
                effectiveness: "confirmed",
                confidence: 80,
              },
              {
                description: "Workaround 2",
                author: "maintainer",
                authorType: "maintainer",
                effectiveness: "suggested",
                confidence: 60,
              },
              {
                description: "Workaround 3",
                author: "contributor",
                authorType: "contributor",
                effectiveness: "partial",
                confidence: 40,
              },
            ],
            tags: ["complex", "multiple-workarounds"],
            sentiment: "negative",
          },
        ],
        summary: {
          totalAnalyzed: 1,
          relevantFound: 1,
          topCategories: ["Bug"],
          analysisModel: "llama2",
          processingErrors: 0,
          totalBatches: 1,
        },
      });

      const result = promptManager.parseStructuredResponse(complexResponse);

      expect(result).not.toBeNull();
      expect(result?.relevantIssues[0].workarounds).toHaveLength(3);
      expect(result?.relevantIssues[0].workarounds[0].author).toBe("user1");
      expect(result?.relevantIssues[0].workarounds[1].authorType).toBe(
        "maintainer"
      );
      expect(result?.relevantIssues[0].workarounds[2].effectiveness).toBe(
        "partial"
      );
      expect(result?.summary.processingErrors).toBe(0);
    });
  });

  describe("Invalid Response Handling", () => {
    test("should return null for non-JSON response", () => {
      const invalidResponse = "This is not a JSON response";

      const result = promptManager.parseStructuredResponse(invalidResponse);

      expect(result).toBeNull();
    });

    test("should return null for malformed JSON", () => {
      const malformedJson =
        '{"relevantIssues": [{"id": 12345, "title": "Incomplete issue"';

      const result = promptManager.parseStructuredResponse(malformedJson);

      expect(result).toBeNull();
    });

    test("should return null for missing required fields", () => {
      const missingFields = JSON.stringify({
        // Missing relevantIssues
        summary: {
          totalAnalyzed: 1,
          relevantFound: 0,
          topCategories: [],
          analysisModel: "llama2",
        },
      });

      const result = promptManager.parseStructuredResponse(missingFields);

      expect(result).toBeNull();
    });

    test("should return null for invalid structure", () => {
      const invalidStructure = JSON.stringify({
        relevantIssues: "not an array", // Should be an array
        summary: {
          totalAnalyzed: 1,
          relevantFound: 0,
          topCategories: [],
          analysisModel: "llama2",
        },
      });

      const result = promptManager.parseStructuredResponse(invalidStructure);

      expect(result).toBeNull();
    });

    test("should return null for empty response", () => {
      const result = promptManager.parseStructuredResponse("");

      expect(result).toBeNull();
    });

    test("should return null for response with only whitespace", () => {
      const result = promptManager.parseStructuredResponse("   \n   ");

      expect(result).toBeNull();
    });
  });

  describe("Edge Cases", () => {
    test("should handle response with minimal valid structure", () => {
      const minimalResponse = JSON.stringify({
        relevantIssues: [],
        summary: {
          totalAnalyzed: 0,
          relevantFound: 0,
          topCategories: [],
          analysisModel: "llama2",
        },
      });

      const result = promptManager.parseStructuredResponse(minimalResponse);

      expect(result).not.toBeNull();
      expect(result?.relevantIssues).toEqual([]);
      expect(result?.summary.totalAnalyzed).toBe(0);
    });

    test("should handle response with extra fields", () => {
      const extraFieldsResponse = JSON.stringify({
        relevantIssues: [
          {
            id: 12345,
            title: "Test issue",
            relevanceScore: 80,
            category: "Bug",
            priority: "high",
            summary: "Test summary",
            workarounds: [],
            tags: ["test"],
            sentiment: "neutral",
            extraField1: "should be ignored",
            extraField2: 123,
          },
        ],
        summary: {
          totalAnalyzed: 1,
          relevantFound: 1,
          topCategories: ["Bug"],
          analysisModel: "llama2",
          extraSummaryField: "should be ignored",
        },
        extraTopLevelField: "should be ignored",
      });

      const result = promptManager.parseStructuredResponse(extraFieldsResponse);

      expect(result).not.toBeNull();
      expect(result?.relevantIssues).toHaveLength(1);

      // TypeScript will ignore extra fields in the parsed result
      const typedResult = result as LLMAnalysisResponse;
      expect(typedResult.relevantIssues[0].id).toBe(12345);
      expect(typedResult.summary.totalAnalyzed).toBe(1);
    });

    test("should handle response with escaped characters", () => {
      const escapedResponse = JSON.stringify({
        relevantIssues: [
          {
            id: 12345,
            title: 'Issue with "quotes" and \\backslashes\\',
            relevanceScore: 80,
            category: "Bug",
            priority: "high",
            summary: 'Summary with \n newlines \t tabs and "quotes"',
            workarounds: [
              {
                description: 'Workaround with "quotes" and \\backslashes\\',
                author: "user",
                authorType: "user",
                effectiveness: "confirmed",
                confidence: 80,
              },
            ],
            tags: ["test"],
            sentiment: "neutral",
          },
        ],
        summary: {
          totalAnalyzed: 1,
          relevantFound: 1,
          topCategories: ["Bug"],
          analysisModel: "llama2",
        },
      });

      const result = promptManager.parseStructuredResponse(escapedResponse);

      expect(result).not.toBeNull();
      expect(result?.relevantIssues[0].title).toContain('"quotes"');
      expect(result?.relevantIssues[0].title).toContain("\\backslashes\\");
      expect(result?.relevantIssues[0].summary).toContain("\n newlines");
      expect(result?.relevantIssues[0].workarounds[0].description).toContain(
        '"quotes"'
      );
    });
  });
});
