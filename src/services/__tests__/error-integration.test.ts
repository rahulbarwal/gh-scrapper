import axios from "axios";
import { GitHubClient } from "../github-client";
import { ErrorHandler, ScraperError, ErrorType } from "../error-handler";
import { GitHubIssue } from "../../models";

// Mock axios
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("Error Handler retry mechanism", () => {
  it("should retry operations with exponential backoff", async () => {
    // Mock sleep to avoid actual delays in tests
    const mockSetTimeout = jest
      .spyOn(global, "setTimeout")
      .mockImplementation((callback: any) => {
        callback();
        return {} as any;
      });

    // Create an operation that fails twice then succeeds
    let attempts = 0;
    const operation = jest.fn().mockImplementation(() => {
      attempts++;
      if (attempts <= 2) {
        const error = new ScraperError(
          ErrorType.NETWORK,
          "Network error",
          { operation: "test operation" },
          [],
          true // isRetryable
        );
        return Promise.reject(error);
      }
      return Promise.resolve("success");
    });

    const result = await ErrorHandler.executeWithRetry(
      operation,
      { operation: "test operation" },
      3 // max retries
    );

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(attempts).toBe(3);

    // Restore setTimeout
    mockSetTimeout.mockRestore();
  });

  it("should give up after max retries", async () => {
    // Mock sleep to avoid actual delays in tests
    const mockSetTimeout = jest
      .spyOn(global, "setTimeout")
      .mockImplementation((callback: any) => {
        callback();
        return {} as any;
      });

    // Create an operation that always fails
    const operation = jest.fn().mockImplementation(() => {
      const error = new ScraperError(
        ErrorType.NETWORK,
        "Persistent network error",
        { operation: "test operation" },
        [],
        true // isRetryable
      );
      return Promise.reject(error);
    });

    await expect(
      ErrorHandler.executeWithRetry(
        operation,
        { operation: "test operation" },
        2 // max retries
      )
    ).rejects.toThrow(ScraperError);

    expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries

    // Restore setTimeout
    mockSetTimeout.mockRestore();
  });
});
