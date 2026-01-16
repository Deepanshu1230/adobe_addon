/**
 * Policy Rules API Routes
 * 
 * GET  /api/rules - List all rules
 * POST /api/rules - Create a new rule
 * PUT  /api/rules/:id - Update a rule
 * DELETE /api/rules/:id - Delete a rule
 */

const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");

/**
 * GET /api/rules
 * List all policy rules
 */
router.get("/", async (req, res) => {
  try {
    const rules = await prisma.policyRule.findMany({
      orderBy: [
        { severity: "desc" },
        { createdAt: "desc" },
      ],
    });

    res.json({
      count: rules.length,
      rules,
    });

  } catch (error) {
    console.error("❌ [rules/list] Error:", error);
    res.status(500).json({ error: "Failed to list rules" });
  }
});

/**
 * POST /api/rules
 * Create a new policy rule
 */
router.post("/", async (req, res) => {
  try {
    const { pattern, reason, suggestion, category, severity } = req.body;

    // Validate required fields
    if (!pattern || !reason || !suggestion) {
      return res.status(400).json({
        error: "Missing required fields",
        message: "pattern, reason, and suggestion are required",
      });
    }

    const rule = await prisma.policyRule.create({
      data: {
        pattern,
        reason,
        suggestion,
        category: category || "general",
        severity: severity || "medium",
      },
    });

    res.status(201).json({
      message: "Rule created successfully",
      rule,
    });

  } catch (error) {
    console.error("❌ [rules/create] Error:", error);
    res.status(500).json({ error: "Failed to create rule" });
  }
});

/**
 * PUT /api/rules/:id
 * Update an existing rule
 */
router.put("/:id", async (req, res) => {
  try {
    const { pattern, reason, suggestion, category, severity, isActive } = req.body;

    const rule = await prisma.policyRule.update({
      where: { id: req.params.id },
      data: {
        ...(pattern && { pattern }),
        ...(reason && { reason }),
        ...(suggestion && { suggestion }),
        ...(category && { category }),
        ...(severity && { severity }),
        ...(typeof isActive === "boolean" && { isActive }),
      },
    });

    res.json({
      message: "Rule updated successfully",
      rule,
    });

  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Rule not found" });
    }
    console.error("❌ [rules/update] Error:", error);
    res.status(500).json({ error: "Failed to update rule" });
  }
});

/**
 * DELETE /api/rules/:id
 * Delete a rule
 */
router.delete("/:id", async (req, res) => {
  try {
    await prisma.policyRule.delete({
      where: { id: req.params.id },
    });

    res.json({ message: "Rule deleted successfully" });

  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Rule not found" });
    }
    console.error("❌ [rules/delete] Error:", error);
    res.status(500).json({ error: "Failed to delete rule" });
  }
});

module.exports = router;
