/**
 * Compliance API Routes
 * 
 * POST /api/compliance/check - Check text for compliance issues (RAG-based)
 * POST /api/check-compliance - Alias endpoint (RAG-based)
 */

const express = require("express");
const router = express.Router();
const { checkCompliance } = require("../services/complianceChecker");

/**
 * POST /api/compliance/check
 * POST /api/check-compliance (alias)
 * 
 * Request body: { text: string }
 * Response: {
 *   isCompliant: boolean,
 *   issues: Array<{text, severity, reason, suggestion}>,
 *   checkedAt: string
 * }
 */
const checkHandler = async (req, res) => {
  try {
    const { text } = req.body;

    // Validate input
    if (!text || typeof text !== "string") {
      return res.status(400).json({
        error: "Invalid request",
        message: "Request body must include 'text' field as a string",
      });
    }

    if (text.trim().length === 0) {
      return res.status(400).json({
        error: "Invalid request",
        message: "Text cannot be empty",
      });
    }

    // Check compliance using RAG
    const result = await checkCompliance(text);

    // Return result
    res.json(result);

  } catch (error) {
    console.error("❌ [compliance/check] Error:", error);
    res.status(500).json({
      error: "Server error",
      message: "Failed to check compliance",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Mount handler on both routes
router.post("/check", checkHandler);
router.post("/check-compliance", checkHandler);

/**
 * GET /api/compliance/stats
 * Get compliance check statistics
 */
router.get("/stats", async (req, res) => {
  try {
    const prisma = require("../lib/prisma");
    
    const totalChecks = await prisma.complianceCheck.count();
    const compliantCount = await prisma.complianceCheck.count({
      where: { isCompliant: true }
    });
    const nonCompliantCount = totalChecks - compliantCount;
    
    res.json({
      totalChecks,
      compliantCount,
      nonCompliantCount,
      complianceRate: totalChecks > 0 
        ? ((compliantCount / totalChecks) * 100).toFixed(1) + "%" 
        : "N/A",
    });
  } catch (error) {
    console.error("❌ [compliance/stats] Error:", error);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

module.exports = router;