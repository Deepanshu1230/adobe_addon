/**
 * Compliance Checker Service - RAG Implementation
 *
 * Uses Retrieval-Augmented Generation (RAG) to check text for compliance issues.
 * Flow:
 * 1. Generate embedding for input text
 * 2. Query Pinecone for relevant policy chunks
 * 3. Use Gemini Pro to analyze compliance with retrieved context
 */

require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const vectorStore = require("./vectorStore");
const prisma = require("../lib/prisma");

// Initialize Google Generative AI client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * Check text for compliance violations using RAG
 *
 * @param {string} text - The marketing copy to check
 * @returns {Promise<{isCompliant: boolean, issues: Array<{text, severity, reason, suggestion}>}>}
 */
async function checkCompliance(text) {
  try {
    // Ensure vector store is connected
    if (!vectorStore.isConnected) {
      await vectorStore.connect();
    }

    // Step 1: Query Pinecone for relevant policy chunks (top 3)
    console.log(
      "🔍 [ComplianceChecker] Searching for relevant policy context..."
    );
    const relevantChunks = await vectorStore.search(text, 3);

    // Step 2: Prepare context from retrieved chunks
    const context = relevantChunks
      .map((chunk, idx) => `[Policy Reference ${idx + 1}]\n${chunk.text}`)
      .join("\n\n");

    // Step 3: Use Gemini Pro to analyze compliance
    console.log(
      "🤖 [ComplianceChecker] Analyzing compliance with Gemini Pro..."
    );
    const analysis = await analyzeWithGemini(text, context);

    // Step 4: Log the check (non-blocking)
    logComplianceCheck({
      originalText: text,
      isCompliant: analysis.isCompliant,
      violationCount: analysis.issues.length,
    }).catch(() => {});

    return {
      isCompliant: analysis.isCompliant,
      issues: analysis.issues,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("❌ [ComplianceChecker] Error:", error);
    throw error;
  }
}

/**
 * Analyze compliance using Gemini Pro with retrieved context
 *
 * @param {string} text - Text to check
 * @param {string} context - Retrieved policy context
 * @returns {Promise<{isCompliant: boolean, issues: Array}>}
 */
async function analyzeWithGemini(text, context) {
  const prompt = `You are a compliance expert analyzing marketing copy against corporate policy documents.

Your task is to:
1. Analyze the provided text for compliance issues based on the policy context
2. Identify any violations, concerns, or potential issues
3. Provide specific, actionable feedback

Policy Context:
${
  context ||
  "No specific policy context found. Use general compliance best practices."
}

Text to Check:
"${text}"

Analyze this text for compliance issues and return ONLY a valid JSON object with this exact structure (no markdown, no code blocks, just the JSON):
{
  "isCompliant": boolean,
  "issues": [
    {
      "text": "the specific problematic text",
      "severity": "high" | "medium" | "low",
      "reason": "why this is a compliance issue",
      "suggestion": "suggested compliant alternative"
    }
  ]
}

If there are no issues, return {"isCompliant": true, "issues": []}.`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const responseText = response.text();

    // Extract JSON from response (handle cases where Gemini might wrap it in markdown)
    let jsonText = responseText.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/```\n?/g, "");
    }

    // Try to parse JSON
    let parsedResult;
    try {
      parsedResult = JSON.parse(jsonText);
    } catch (parseError) {
      // If parsing fails, try to extract JSON object from the text
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse JSON from response");
      }
    }

    // Validate and normalize the response
    return {
      isCompliant: parsedResult.isCompliant === true,
      issues: Array.isArray(parsedResult.issues)
        ? parsedResult.issues.map((issue) => ({
            text: issue.text || "",
            severity: issue.severity || "medium",
            reason: issue.reason || "",
            suggestion: issue.suggestion || "",
          }))
        : [],
    };
  } catch (error) {
    console.error("❌ [ComplianceChecker] Gemini Pro analysis failed:", error);

    // Fallback: return a basic response
    return {
      isCompliant: false,
      issues: [
        {
          text: text,
          severity: "medium",
          reason: "Unable to analyze compliance due to API error",
          suggestion: "Please review manually",
        },
      ],
    };
  }
}

/**
 * Log a compliance check for analytics (optional)
 */
async function logComplianceCheck(result) {
  try {
    await prisma.complianceCheck.create({
      data: {
        inputText: result.originalText,
        isCompliant: result.isCompliant,
        violationCount: result.violationCount || 0,
      },
    });
  } catch (error) {
    // Non-critical, just log and continue
    console.warn("Could not log compliance check:", error.message);
  }
}

module.exports = {
  checkCompliance,
  logComplianceCheck,
};