/**
 * Workflow API Routes
 * 
 * Handles team collaboration and approval workflows with compliance integration
 */

const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const { checkCompliance } = require("../services/complianceChecker");

// Default workflow steps configuration
const DEFAULT_WORKFLOW_STEPS = [
  { stepNumber: 1, stepName: "Manager Review", requiredRole: "MANAGER" },
  { stepNumber: 2, stepName: "Legal Review", requiredRole: "LEGAL" },
  { stepNumber: 3, stepName: "Executive Approval", requiredRole: "EXECUTIVE" },
];

// ============================================
// USER ROUTES
// ============================================

/**
 * POST /api/workflow/users - Create a new user
 */
router.post("/users", async (req, res) => {
  try {
    const { name, email, role } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: "Name and email are required" });
    }

    const user = await prisma.user.create({
      data: {
        name,
        email,
        role: role || "DESIGNER",
        avatar: name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2),
      },
    });

    res.status(201).json({ user });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(400).json({ error: "Email already exists" });
    }
    console.error("❌ [workflow/users] Error:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

/**
 * GET /api/workflow/users - List all users
 */
router.get("/users", async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { name: "asc" },
    });
    res.json({ users });
  } catch (error) {
    console.error("❌ [workflow/users] Error:", error);
    res.status(500).json({ error: "Failed to list users" });
  }
});

/**
 * GET /api/workflow/users/:id - Get a specific user
 */
router.get("/users/:id", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        createdContent: true,
        assignedSteps: { include: { workflow: { include: { content: true } } } },
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user });
  } catch (error) {
    console.error("❌ [workflow/users] Error:", error);
    res.status(500).json({ error: "Failed to get user" });
  }
});

// ============================================
// CONTENT ROUTES (WITH COMPLIANCE)
// ============================================

/**
 * POST /api/workflow/content - Create new content with compliance check
 */
router.post("/content", async (req, res) => {
  try {
    const { title, text, description, creatorId } = req.body;

    if (!title || !text || !creatorId) {
      return res.status(400).json({ error: "Title, text, and creatorId are required" });
    }

    // Run compliance check
    let complianceResult = null;
    try {
      complianceResult = await checkCompliance(text);
    } catch (err) {
      console.warn("⚠️ Compliance check failed:", err.message);
    }

    const content = await prisma.content.create({
      data: {
        title,
        text,
        description,
        creatorId,
        status: "DRAFT",
        complianceResult: complianceResult || null,
      },
      include: {
        creator: true,
      },
    });

    res.status(201).json({ 
      content,
      complianceResult,
    });
  } catch (error) {
    console.error("❌ [workflow/content] Error:", error);
    res.status(500).json({ error: "Failed to create content" });
  }
});

/**
 * GET /api/workflow/content - List all content
 */
router.get("/content", async (req, res) => {
  try {
    const { status, creatorId } = req.query;
    
    const where = {};
    if (status) where.status = status;
    if (creatorId) where.creatorId = creatorId;

    const content = await prisma.content.findMany({
      where,
      include: {
        creator: true,
        workflow: {
          include: {
            steps: {
              orderBy: { stepNumber: "asc" },
              include: { assignee: true },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Parse compliance results
    const contentWithParsedCompliance = content.map(item => ({
      ...item,
      complianceResult: item.complianceResult ? JSON.parse(item.complianceResult) : null,
    }));

    res.json({ content: contentWithParsedCompliance });
  } catch (error) {
    console.error("❌ [workflow/content] Error:", error);
    res.status(500).json({ error: "Failed to list content" });
  }
});

/**
 * GET /api/workflow/content/:id - Get content with full workflow details
 */
router.get("/content/:id", async (req, res) => {
  try {
    const content = await prisma.content.findUnique({
      where: { id: req.params.id },
      include: {
        creator: true,
        workflow: {
          include: {
            steps: {
              orderBy: { stepNumber: "asc" },
              include: {
                assignee: true,
                comments: {
                  include: { author: true },
                  orderBy: { createdAt: "asc" },
                },
              },
            },
          },
        },
      },
    });

    if (!content) {
      return res.status(404).json({ error: "Content not found" });
    }

    // Parse compliance result
    const parsedContent = {
      ...content,
      complianceResult: content.complianceResult ? JSON.parse(content.complianceResult) : null,
    };

    res.json({ content: parsedContent });
  } catch (error) {
    console.error("❌ [workflow/content] Error:", error);
    res.status(500).json({ error: "Failed to get content" });
  }
});

/**
 * PUT /api/workflow/content/:id - Update content text with compliance re-check
 */
router.put("/content/:id", async (req, res) => {
  try {
    const { text, title, description } = req.body;

    const content = await prisma.content.findUnique({
      where: { id: req.params.id },
    });

    if (!content) {
      return res.status(404).json({ error: "Content not found" });
    }

    // Only allow edits on DRAFT or CHANGES_REQUESTED status
    if (!["DRAFT", "CHANGES_REQUESTED"].includes(content.status)) {
      return res.status(400).json({ 
        error: "Cannot edit content in current status",
        status: content.status,
      });
    }

    // Re-check compliance if text changed
    let complianceResult = null;
    const newText = text || content.text;
    if (text && text !== content.text) {
      try {
        complianceResult = await checkCompliance(newText);
      } catch (err) {
        console.warn("⚠️ Compliance check failed:", err.message);
      }
    } else if (content.complianceResult) {
      complianceResult = JSON.parse(content.complianceResult);
    }

    const updated = await prisma.content.update({
      where: { id: req.params.id },
      data: {
        text: newText,
        title: title || content.title,
        description: description !== undefined ? description : content.description,
        version: content.version + 1,
        complianceResult: complianceResult ? JSON.stringify(complianceResult) : content.complianceResult,
      },
      include: { creator: true },
    });

    res.json({ 
      content: updated,
      complianceResult,
    });
  } catch (error) {
    console.error("❌ [workflow/content] Error:", error);
    res.status(500).json({ error: "Failed to update content" });
  }
});

/**
 * POST /api/workflow/content/:id/submit - Submit content for review
 * BLOCKS submission if HIGH severity compliance issues exist
 */
router.post("/content/:id/submit", async (req, res) => {
  try {
    const content = await prisma.content.findUnique({
      where: { id: req.params.id },
      include: { workflow: true },
    });

    if (!content) {
      return res.status(404).json({ error: "Content not found" });
    }

    // Check for HIGH severity compliance issues
    if (content.complianceResult) {
      try {
        const compliance = JSON.parse(content.complianceResult);
        const highIssues = compliance.issues?.filter(i => i.severity === "high") || [];
        
        if (highIssues.length > 0) {
          return res.status(400).json({
            error: "Cannot submit content with HIGH severity compliance issues",
            complianceIssues: highIssues,
            message: "Please fix all HIGH severity issues before submitting",
          });
        }
      } catch (err) {
        console.warn("⚠️ Could not parse compliance result:", err);
      }
    }

    // If workflow already exists, reset it
    if (content.workflow) {
      await prisma.workflow.delete({ where: { id: content.workflow.id } });
    }

    // Create workflow with steps
    const workflow = await prisma.workflow.create({
      data: {
        contentId: content.id,
        currentStep: 1,
        status: "ACTIVE",
        steps: {
          create: DEFAULT_WORKFLOW_STEPS.map(step => ({
            stepNumber: step.stepNumber,
            stepName: step.stepName,
            requiredRole: step.requiredRole,
            status: step.stepNumber === 1 ? "IN_PROGRESS" : "PENDING",
          })),
        },
      },
      include: {
        steps: { orderBy: { stepNumber: "asc" } },
      },
    });

    // Update content status
    await prisma.content.update({
      where: { id: content.id },
      data: { status: "PENDING_REVIEW" },
    });

    res.json({ 
      message: "Content submitted for review",
      workflow,
    });
  } catch (error) {
    console.error("❌ [workflow/content/submit] Error:", error);
    res.status(500).json({ error: "Failed to submit content" });
  }
});

// ============================================
// WORKFLOW STEP ACTIONS
// ============================================

/**
 * POST /api/workflow/steps/:id/approve - Approve a step
 */
router.post("/steps/:id/approve", async (req, res) => {
  try {
    const { userId } = req.body;

    const step = await prisma.approvalStep.findUnique({
      where: { id: req.params.id },
      include: {
        workflow: {
          include: {
            content: true,
            steps: { orderBy: { stepNumber: "asc" } },
          },
        },
      },
    });

    if (!step) {
      return res.status(404).json({ error: "Step not found" });
    }

    if (step.status !== "IN_PROGRESS") {
      return res.status(400).json({ error: "Step is not in progress" });
    }

    // Verify user has correct role
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.role !== step.requiredRole) {
        return res.status(403).json({ 
          error: "User does not have required role",
          required: step.requiredRole,
          userRole: user?.role,
        });
      }
    }

    // Update step to approved
    await prisma.approvalStep.update({
      where: { id: step.id },
      data: {
        status: "APPROVED",
        assigneeId: userId,
        decidedAt: new Date(),
      },
    });

    // Check if this was the last step
    const nextStep = step.workflow.steps.find(s => s.stepNumber === step.stepNumber + 1);

    if (nextStep) {
      // Move to next step
      await prisma.approvalStep.update({
        where: { id: nextStep.id },
        data: { status: "IN_PROGRESS" },
      });
      await prisma.workflow.update({
        where: { id: step.workflowId },
        data: { currentStep: nextStep.stepNumber },
      });
      await prisma.content.update({
        where: { id: step.workflow.contentId },
        data: { status: "IN_REVIEW" },
      });
    } else {
      // All steps complete - mark as approved
      await prisma.workflow.update({
        where: { id: step.workflowId },
        data: { status: "COMPLETED" },
      });
      await prisma.content.update({
        where: { id: step.workflow.contentId },
        data: { status: "APPROVED" },
      });
    }

    // Fetch updated content
    const updatedContent = await prisma.content.findUnique({
      where: { id: step.workflow.contentId },
      include: {
        creator: true,
        workflow: {
          include: {
            steps: {
              orderBy: { stepNumber: "asc" },
              include: { assignee: true },
            },
          },
        },
      },
    });

    res.json({ 
      message: nextStep ? "Step approved, moved to next step" : "All steps approved!",
      content: updatedContent,
    });
  } catch (error) {
    console.error("❌ [workflow/steps/approve] Error:", error);
    res.status(500).json({ error: "Failed to approve step" });
  }
});

/**
 * POST /api/workflow/steps/:id/reject - Reject a step
 */
router.post("/steps/:id/reject", async (req, res) => {
  try {
    const { userId, feedback } = req.body;

    if (!feedback) {
      return res.status(400).json({ error: "Feedback is required when rejecting" });
    }

    const step = await prisma.approvalStep.findUnique({
      where: { id: req.params.id },
      include: {
        workflow: { include: { content: true } },
      },
    });

    if (!step) {
      return res.status(404).json({ error: "Step not found" });
    }

    if (step.status !== "IN_PROGRESS") {
      return res.status(400).json({ error: "Step is not in progress" });
    }

    // Update step to rejected
    await prisma.approvalStep.update({
      where: { id: step.id },
      data: {
        status: "REJECTED",
        assigneeId: userId,
        feedback,
        decidedAt: new Date(),
      },
    });

    // Update content status to request changes
    await prisma.content.update({
      where: { id: step.workflow.contentId },
      data: { status: "CHANGES_REQUESTED" },
    });

    // Fetch updated content
    const updatedContent = await prisma.content.findUnique({
      where: { id: step.workflow.contentId },
      include: {
        creator: true,
        workflow: {
          include: {
            steps: {
              orderBy: { stepNumber: "asc" },
              include: { assignee: true },
            },
          },
        },
      },
    });

    res.json({ 
      message: "Step rejected, changes requested",
      content: updatedContent,
    });
  } catch (error) {
    console.error("❌ [workflow/steps/reject] Error:", error);
    res.status(500).json({ error: "Failed to reject step" });
  }
});

/**
 * POST /api/workflow/steps/:id/comment - Add comment to step
 */
router.post("/steps/:id/comment", async (req, res) => {
  try {
    const { authorId, text } = req.body;

    if (!authorId || !text) {
      return res.status(400).json({ error: "Author and text are required" });
    }

    const step = await prisma.approvalStep.findUnique({
      where: { id: req.params.id },
    });

    if (!step) {
      return res.status(404).json({ error: "Step not found" });
    }

    const comment = await prisma.comment.create({
      data: {
        stepId: step.id,
        authorId,
        text,
      },
      include: { author: true },
    });

    res.status(201).json({ comment });
  } catch (error) {
    console.error("❌ [workflow/steps/comment] Error:", error);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

/**
 * POST /api/workflow/content/:id/publish - Publish approved content
 */
router.post("/content/:id/publish", async (req, res) => {
  try {
    const content = await prisma.content.findUnique({
      where: { id: req.params.id },
    });

    if (!content) {
      return res.status(404).json({ error: "Content not found" });
    }

    if (content.status !== "APPROVED") {
      return res.status(400).json({ 
        error: "Only approved content can be published",
        currentStatus: content.status,
      });
    }

    const updated = await prisma.content.update({
      where: { id: req.params.id },
      data: { status: "PUBLISHED" },
      include: {
        creator: true,
        workflow: {
          include: {
            steps: {
              orderBy: { stepNumber: "asc" },
              include: { assignee: true },
            },
          },
        },
      },
    });

    res.json({ 
      message: "Content published successfully! 🚀",
      content: updated,
    });
  } catch (error) {
    console.error("❌ [workflow/content/publish] Error:", error);
    res.status(500).json({ error: "Failed to publish content" });
  }
});

module.exports = router;