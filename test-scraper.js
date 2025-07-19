#!/usr/bin/env node

// Simple test script to verify the scraper works
const { execSync } = require("child_process");

console.log("🧪 Testing GitHub Issue Scraper...\n");

try {
  // Build the project first
  console.log("📦 Building project...");
  execSync("npm run build", { stdio: "inherit" });

  console.log("\n✅ Build successful!");
  console.log("\n📋 To test the scraper, you can run:");
  console.log("   export GITHUB_TOKEN=your_token_here");
  console.log(
    '   node dist/cli/index.js -r microsoft/vscode -p "editor performance" --verbose'
  );
  console.log("\n   Or use the interactive mode:");
  console.log("   node dist/cli/index.js --interactive");
  console.log("\n   Or run setup first:");
  console.log("   node dist/cli/index.js --setup");
} catch (error) {
  console.error("❌ Test failed:", error.message);
  process.exit(1);
}
