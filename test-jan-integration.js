const { GitHubIssueScraper, JanClient } = require("./dist/services");

async function testJanIntegration() {
  console.log("🧪 Testing Jan AI Integration");

  // Check environment variables first
  const janModel = process.env.JAN_MODEL;
  const janUrl = process.env.JAN_URL || "http://localhost:1337/v1";
  const janMaxTokens = process.env.JAN_MAX_TOKENS
    ? Number(process.env.JAN_MAX_TOKENS)
    : 4000;
  const janTemperature = process.env.JAN_TEMPERATURE
    ? Number(process.env.JAN_TEMPERATURE)
    : 0.3;
  const janTimeout = process.env.JAN_TIMEOUT
    ? Number(process.env.JAN_TIMEOUT)
    : 30000;

  if (!janModel) {
    console.log("⚠️  JAN_MODEL environment variable not set");
    console.log("📝 Jan AI will not be available - using fallback analysis");
    console.log("💡 To enable Jan AI:");
    console.log(
      '   export JAN_MODEL="llama-3.2-3b-instruct"  # or your model name'
    );
    console.log(
      '   export JAN_MAX_TOKENS="4000"              # optional: for detailed analysis'
    );
    console.log(
      '   export JAN_TEMPERATURE="0.3"             # optional: for consistent results'
    );
  } else {
    console.log("✅ Jan AI environment variables detected:");
    console.log(`   JAN_MODEL: ${janModel}`);
    console.log(`   JAN_URL: ${janUrl}`);
    console.log(`   JAN_MAX_TOKENS: ${janMaxTokens}`);
    console.log(`   JAN_TEMPERATURE: ${janTemperature}`);
    console.log(`   JAN_TIMEOUT: ${janTimeout}`);
  }

  // Test Jan client connection if model is configured
  if (janModel) {
    const janClient = new JanClient({
      baseUrl: janUrl,
      model: janModel,
      temperature: janTemperature,
      maxTokens: janMaxTokens,
      timeout: janTimeout,
    });

    try {
      console.log("\n📡 Testing Jan AI connection...");
      const connection = await janClient.testConnection();

      if (connection.connected) {
        console.log("✅ Jan AI connected successfully!");
        console.log("🎯 Available for intelligent issue analysis");
      } else {
        console.log("⚠️  Jan AI not available:", connection.error);
        console.log("📝 Will use fallback analysis");
      }
    } catch (error) {
      console.log("❌ Jan AI test failed:", error.message);
      console.log("📝 Will use fallback analysis");
    }
  }

  // Test issue analysis if a GitHub token is available
  const githubToken = process.env.GITHUB_TOKEN;

  if (githubToken) {
    console.log("\n🚀 Testing complete scraper integration...");

    const janConfig = janModel
      ? {
          baseUrl: janUrl,
          model: janModel,
          temperature: janTemperature,
          maxTokens: janMaxTokens,
          timeout: janTimeout,
        }
      : undefined;

    const scraper = new GitHubIssueScraper(githubToken, janConfig);

    const config = {
      githubToken,
      repository: "microsoft/vscode", // Small test
      productArea: "authentication",
      maxIssues: 3, // Keep it small for testing
      minRelevanceScore: 50,
      outputPath: "./test-reports",
    };

    try {
      const result = await scraper.scrapeRepository(config, (progress) => {
        console.log(`📊 ${progress.phase}: ${progress.message}`);
      });

      console.log("\n✅ Integration test completed!");
      console.log(`📈 Analysis method: ${result.metadata.analysisMethod}`);
      console.log(`🔍 Issues analyzed: ${result.metadata.totalIssuesAnalyzed}`);
      console.log(`🎯 Relevant found: ${result.metadata.relevantIssuesFound}`);
      console.log(`💡 Workarounds: ${result.metadata.workaroundsFound}`);
      console.log(`📄 Report: ${result.reportPath}`);

      if (result.metadata.janConnectionStatus) {
        console.log(`🤖 Jan status: ${result.metadata.janConnectionStatus}`);
      }
    } catch (error) {
      console.log("❌ Scraper test failed:", error.message);
    }
  } else {
    console.log(
      "\n⚠️  Set GITHUB_TOKEN environment variable to test full integration"
    );
    console.log("   export GITHUB_TOKEN=your_token_here");
    console.log("   node test-jan-integration.js");
  }

  console.log("\n📋 Quick Setup Summary:");
  console.log(
    "   export GITHUB_TOKEN=your_token_here                    # Required"
  );
  console.log(
    '   export JAN_MODEL="llama-3.2-3b-instruct"              # For AI analysis'
  );
  console.log(
    '   export JAN_MAX_TOKENS="4000"                          # Optional: more detailed analysis'
  );
  console.log(
    '   export JAN_TEMPERATURE="0.3"                          # Optional: consistent results'
  );
}

// Run the test
testJanIntegration().catch(console.error);
