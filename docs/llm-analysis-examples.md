# LLM Analysis Examples

This document provides examples of LLM analysis output from the GitHub Issue Scraper and guidance on how to interpret the results.

## Example 1: Performance Issue

### Raw GitHub Issue

```
Title: Editor becomes unresponsive with large files
Labels: bug, performance, editor-core
User: developer123
Comments: 15

Description:
When opening files larger than 50MB, the editor becomes completely unresponsive.
I've tried this on Windows 10 and macOS, with the same results. The UI freezes,
syntax highlighting stops working, and scrolling becomes impossible.

Steps to reproduce:
1. Open a large log file (>50MB)
2. Try to scroll or edit the file
3. Editor freezes for several seconds

Is anyone else experiencing this? Any workarounds?

---

Comment by vscode-team:
Thanks for reporting this. As a workaround, you can disable syntax highlighting
for large files by adding "editor.largeFileOptimizations": true to your settings.json.
We're working on a more permanent fix.

---

Comment by user456:
I found that using the "Large File Support" extension helps with this issue.
It loads the file in chunks instead of all at once.

---

Comment by contributor789:
@developer123 What's your system specs? I've noticed this happens more on systems
with less than 16GB RAM.
```

### LLM Analysis Output

```json
{
  "id": 156789,
  "title": "Editor becomes unresponsive with large files",
  "relevanceScore": 92,
  "category": "Performance Degradation",
  "priority": "high",
  "summary": "VS Code editor becomes completely unresponsive when opening files larger than 50MB, affecting syntax highlighting, scrolling, and basic text editing operations across different operating systems.",
  "workarounds": [
    {
      "description": "Disable syntax highlighting for large files by adding 'editor.largeFileOptimizations': true to settings.json",
      "author": "vscode-team",
      "authorType": "maintainer",
      "effectiveness": "confirmed",
      "confidence": 95
    },
    {
      "description": "Use the 'Large File Support' extension which provides chunked loading",
      "author": "user456",
      "authorType": "user",
      "effectiveness": "suggested",
      "confidence": 80
    }
  ],
  "tags": ["performance", "large-files", "editor-core", "optimization"],
  "sentiment": "negative"
}
```

### Interpretation

- **Relevance Score (92/100)**: This issue is highly relevant to the "editor performance" product area
- **Category**: The LLM categorized this as "Performance Degradation"
- **Priority**: Assigned "high" priority based on impact and user sentiment
- **Summary**: The LLM generated a concise summary capturing the key points
- **Workarounds**:
  - The LLM correctly identified an official workaround from the maintainer with high confidence (95%)
  - It also found a community-suggested workaround with good confidence (80%)
- **Tags**: The LLM generated relevant tags for categorization
- **Sentiment**: Correctly identified as negative, indicating user frustration

## Example 2: API Issue

### Raw GitHub Issue

```
Title: Authentication fails with specific OAuth scopes
Labels: bug, authentication, api
User: api-user
Comments: 8

Description:
When requesting the 'user:email' scope without also requesting 'read:user',
the authentication flow completes but subsequent API calls fail with 401.

This worked in v2.5 but broke in v2.6.

---

Comment by maintainer:
This is a known issue with the new auth flow. For now, you need to request both
'user:email' and 'read:user' scopes together.

---

Comment by contributor:
You can also work around this by using the legacy authentication endpoint
at /api/v1/auth instead of /api/v2/auth.

---

Comment by api-user:
@contributor That worked! Thanks for the suggestion.
```

### LLM Analysis Output

```json
{
  "id": 123456,
  "title": "Authentication fails with specific OAuth scopes",
  "relevanceScore": 85,
  "category": "Authentication API",
  "priority": "medium",
  "summary": "OAuth authentication fails with 401 errors when requesting 'user:email' scope without also requesting 'read:user'. This regression appeared in v2.6 after working correctly in v2.5.",
  "workarounds": [
    {
      "description": "Request both 'user:email' and 'read:user' scopes together",
      "author": "maintainer",
      "authorType": "maintainer",
      "effectiveness": "confirmed",
      "confidence": 90
    },
    {
      "description": "Use the legacy authentication endpoint at /api/v1/auth instead of /api/v2/auth",
      "author": "contributor",
      "authorType": "contributor",
      "effectiveness": "confirmed",
      "confidence": 85
    }
  ],
  "tags": ["authentication", "oauth", "api", "regression"],
  "sentiment": "neutral"
}
```

### Interpretation

- **Relevance Score (85/100)**: This issue is highly relevant to the "authentication" product area
- **Category**: The LLM categorized this as "Authentication API"
- **Priority**: Assigned "medium" priority based on impact and workaround availability
- **Summary**: The LLM generated a concise summary capturing the key points including version regression
- **Workarounds**:
  - The LLM identified two confirmed workarounds with high confidence
  - It correctly distinguished between maintainer and contributor solutions
- **Tags**: The LLM generated relevant tags including "regression" which wasn't in the original labels
- **Sentiment**: Identified as neutral, reflecting the technical nature of the issue

## Example 3: Feature Request

### Raw GitHub Issue

```
Title: Support for custom themes in dark mode
Labels: enhancement, ui, themes
User: theme-lover
Comments: 5

Description:
It would be great if we could have separate custom themes for light and dark mode.
Currently, my custom theme only works well in light mode, and looks terrible when
I switch to dark mode.

---

Comment by ui-designer:
This is on our roadmap for the next major release. In the meantime, you can create
two separate theme files and manually switch between them.

---

Comment by theme-lover:
@ui-designer Thanks for the update! Looking forward to the official support.
```

### LLM Analysis Output

```json
{
  "id": 789012,
  "title": "Support for custom themes in dark mode",
  "relevanceScore": 45,
  "category": "UI Customization",
  "priority": "low",
  "summary": "Feature request to support separate custom themes for light and dark mode, as current custom themes only work well in one mode or the other.",
  "workarounds": [
    {
      "description": "Create two separate theme files and manually switch between them",
      "author": "ui-designer",
      "authorType": "maintainer",
      "effectiveness": "partial",
      "confidence": 75
    }
  ],
  "tags": ["themes", "dark-mode", "customization", "ui"],
  "sentiment": "positive"
}
```

### Interpretation

- **Relevance Score (45/100)**: This issue has moderate relevance to the product area
- **Category**: The LLM categorized this as "UI Customization"
- **Priority**: Assigned "low" priority as it's a feature request, not a critical bug
- **Summary**: The LLM generated a concise summary capturing the feature request
- **Workarounds**:
  - The LLM identified one partial workaround with moderate confidence (75%)
  - Correctly identified as a partial solution since it requires manual switching
- **Tags**: The LLM generated relevant tags including "dark-mode" which wasn't in the original labels
- **Sentiment**: Identified as positive, reflecting the constructive nature of the request and response

## Factors Affecting Analysis Quality

The quality of LLM analysis can vary based on several factors:

### 1. Model Selection

Different JAN models have different analysis capabilities:

- **llama2**: Good general analysis with balanced performance
- **mistral**: Better at technical understanding and workaround extraction
- **phi**: Faster but sometimes less detailed analysis
- **llama3**: Most comprehensive analysis but requires more resources

### 2. Issue Complexity

- **Simple issues**: Generally receive more accurate analysis
- **Complex issues**: May have less precise categorization or summary
- **Technical jargon**: Better handled by more advanced models like mistral or llama3

### 3. Comment Quality

- **Clear, detailed comments**: Yield better workaround extraction
- **Ambiguous comments**: May result in lower confidence scores
- **Multiple solutions**: The LLM will attempt to rank them by effectiveness

### 4. Product Area Specificity

- **Specific product areas**: Yield more focused and accurate relevance scores
- **Vague product areas**: Result in broader matching but less precision
- **Technical product areas**: Better analyzed by more advanced models

## Tips for Optimal Analysis

1. **Choose the right model** for your specific needs
2. **Use specific product area keywords** for better relevance scoring
3. **Process manageable batches** (25-50 issues) for optimal quality
4. **Focus on high confidence workarounds** (80%+ confidence)
5. **Look for patterns in categories** to identify common problem areas
