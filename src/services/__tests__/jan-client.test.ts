import { JANClient } from "../jan-client";
import axios from "axios";
import { ScraperError, ErrorType } from "../error-handler";

// Mock axios
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("JANClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("validateConnection", () => {
    it("should return true when JAN server is available", async () => {
      mockedAxios.get.mockResolvedValueOnce({ status: 200 });

      const janClient = new JANClient();
      const result = await janClient.validateConnection();

      expect(result).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        "http://localhost:1337/health",
        { timeout: 5000 }
      );
    });

    it("should throw ScraperError when JAN server is not available", async () => {
      mockedAxios.get.mockRejectedValueOnce({
        code: "ECONNREFUSED",
        message: "Connection refused",
      });

      const janClient = new JANClient();
      await expect(janClient.validateConnection()).rejects.toThrow(
        ScraperError
      );
      await expect(janClient.validateConnection()).rejects.toMatchObject({
        type: ErrorType.NETWORK,
      });
    });

    it("should use custom endpoint when provided", async () => {
      mockedAxios.get.mockResolvedValueOnce({ status: 200 });

      const customEndpoint = "http://custom-jan-server:8080";
      const janClient = new JANClient({ endpoint: customEndpoint });
      const result = await janClient.validateConnection();

      expect(result).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith(`${customEndpoint}/health`, {
        timeout: 5000,
      });
    });
  });

  describe("validateModel", () => {
    it("should return true when model is available", async () => {
      // Mock successful connection
      mockedAxios.get.mockImplementation((url) => {
        if (url.includes("/health")) {
          return Promise.resolve({ status: 200 });
        }
        if (url.includes("/v1/models")) {
          return Promise.resolve({
            status: 200,
            data: {
              data: [
                { id: "llama2" },
                { id: "mistral" },
                { id: "gpt-3.5-turbo" },
              ],
            },
          });
        }
        return Promise.reject(new Error("Unexpected URL"));
      });

      const janClient = new JANClient({ model: "llama2" });
      const result = await janClient.validateModel();

      expect(result).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        "http://localhost:1337/v1/models",
        { timeout: 60000 }
      );
    });

    it("should throw ScraperError when model is not available", async () => {
      // Mock successful connection but model not found
      mockedAxios.get.mockImplementation((url) => {
        if (url.includes("/health")) {
          return Promise.resolve({ status: 200 });
        }
        if (url.includes("/v1/models")) {
          return Promise.resolve({
            status: 200,
            data: {
              data: [{ id: "mistral" }, { id: "gpt-3.5-turbo" }],
            },
          });
        }
        return Promise.reject(new Error("Unexpected URL"));
      });

      const janClient = new JANClient({ model: "llama2" });
      await expect(janClient.validateModel()).rejects.toThrow(ScraperError);
      await expect(janClient.validateModel()).rejects.toMatchObject({
        type: ErrorType.VALIDATION,
      });
    });

    it("should validate a specific model when provided", async () => {
      // Mock successful connection
      mockedAxios.get.mockImplementation((url) => {
        if (url.includes("/health")) {
          return Promise.resolve({ status: 200 });
        }
        if (url.includes("/v1/models")) {
          return Promise.resolve({
            status: 200,
            data: {
              data: [
                { id: "llama2" },
                { id: "mistral" },
                { id: "gpt-3.5-turbo" },
              ],
            },
          });
        }
        return Promise.reject(new Error("Unexpected URL"));
      });

      const janClient = new JANClient();
      const result = await janClient.validateModel("mistral");

      expect(result).toBe(true);
    });
  });

  describe("updateOptions", () => {
    it("should update client options", () => {
      const janClient = new JANClient();
      const initialOptions = janClient.getOptions();

      const newOptions = {
        endpoint: "http://new-endpoint:8080",
        model: "new-model",
        apiKey: "new-api-key",
        maxRetries: 5,
        timeout: 30000,
      };

      janClient.updateOptions(newOptions);
      const updatedOptions = janClient.getOptions();

      expect(updatedOptions).toEqual(newOptions);
      expect(updatedOptions).not.toEqual(initialOptions);
    });

    it("should partially update client options", () => {
      const janClient = new JANClient();
      const initialOptions = janClient.getOptions();

      const partialOptions = {
        endpoint: "http://new-endpoint:8080",
        model: "new-model",
      };

      janClient.updateOptions(partialOptions);
      const updatedOptions = janClient.getOptions();

      expect(updatedOptions.endpoint).toEqual(partialOptions.endpoint);
      expect(updatedOptions.model).toEqual(partialOptions.model);
      expect(updatedOptions.apiKey).toEqual(initialOptions.apiKey);
      expect(updatedOptions.maxRetries).toEqual(initialOptions.maxRetries);
      expect(updatedOptions.timeout).toEqual(initialOptions.timeout);
    });
  });
});
