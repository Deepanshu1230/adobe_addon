/**
 * Compliance Checker Service
 * 
 * Checks text against policy rules and suggests compliant alternatives.
 * Currently uses keyword matching; designed to be replaced with RAG.
 */

const prisma = require("../lib/prisma");

// Fallback rules if database is empty/unavailable
const FALLBACK_RULES = [
  {
    pattern: "100% waterproof",
    reason: "Product is only water-resistant (IP67), not fully waterproof.",
    suggestion: "water-resistant (IP67 rated)",
    category: "legal",
    severity: "high",
  },
  {
    pattern: "waterproof",
    reason: "Avoid unqualified 'waterproof' claims; specify rating.",
    suggestion: "water-resistant",
    category: "legal",
    severity: "medium",
  },
  {
    pattern: "guaranteed",
    reason: "'Guaranteed' implies legal warranty; verify with Legal.",
    suggestion: "designed to",
    category: "legal",
    severity: "medium",
  },
  {
    pattern: "never fails",
    reason: "Absolute reliability claims are legally risky.",
    suggestion: "highly reliable",
    category: "legal",
    severity: "high",
  },
];

/**
 * Get all active policy rules from database
 * Falls back to hardcoded rules if DB unavailable
 */
async function getRules() {
  try {
    const rules = await prisma.policyRule.findMany({
      where: { isActive: true },
      orderBy: { severity: "desc" },
    });
    return rules.length > 0 ? rules : FALLBACK_RULES;
  } catch (error) {
    console.warn("⚠️ Could not fetch rules from DB, using fallback:", error.message);
    return FALLBACK_RULES;
  }
}

/**
 * Check text for compliance violations
 * 
 * @param {string} text - The marketing copy to check
 * @returns {Promise<{isCompliant: boolean, violations: Array, suggestedRewrite: string}>}
 */
async function checkCompliance(text) {
  const rules = await getRules();
  const lowerText = text.toLowerCase();
  const violations = [];

  // Check each rule against the text
  for (const rule of rules) {
    const pattern = rule.pattern.toLowerCase();
    if (lowerText.includes(pattern)) {
      violations.push({
        id: rule.id || `rule-${violations.length}`,
        pattern: rule.pattern,
        reason: rule.reason,
        suggestion: rule.suggestion,
        category: rule.category,
        severity: rule.severity,
      });
    }
  }

  // Sort violations by severity (high > medium > low)
  const severityOrder = { high: 0, medium: 1, low: 2 };
  violations.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Generate suggested rewrite
  const suggestedRewrite = generateRewrite(text, violations);

  return {
    isCompliant: violations.length === 0,
    violations,
    suggestedRewrite,
    originalText: text,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Generate a compliant rewrite by replacing violations
 * Simple find-replace for demo; LLM-based in full RAG version
 */
function generateRewrite(text, violations) {
  let rewritten = text;
  
  // Sort by pattern length (longest first) to avoid partial replacements
  const sortedViolations = [...violations].sort(
    (a, b) => b.pattern.length - a.pattern.length
  );

  for (const v of sortedViolations) {
    // Case-insensitive replacement
    const regex = new RegExp(escapeRegex(v.pattern), "gi");
    rewritten = rewritten.replace(regex, v.suggestion);
  }

  return rewritten;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
        violationCount: result.violations.length,
        suggestedRewrite: result.suggestedRewrite,
      },
    });
  } catch (error) {
    // Non-critical, just log and continue
    console.warn("Could not log compliance check:", error.message);
  }
}

module.exports = {
  checkCompliance,
  getRules,
  logComplianceCheck,
};
