/**
 * Corporate Brain - Express Server
 * Main entry point for the backend API
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

// Import Prisma client
const prisma = require("./lib/prisma");

// Import routes and services
const complianceRoutes = require("./routes/compliance");
const documentsRoutes = require("./routes/documents");
const rulesRoutes = require("./routes/rules");
const workflowRoutes = require("./routes/workflow");
const { checkCompliance } = require("./services/complianceChecker");

// Initialize Express app
const app = express();

// ============================================
// MIDDLEWARE
// ============================================

// CORS - Allow requests from all origins
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Parse JSON bodies with 50mb limit (for Base64 images)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// ============================================
// ADOBE EXPRESS DESIGN TRACKING ENDPOINTS
// ============================================

/**
 * POST /api/submit
 * Submit a design for approval
 * Input: { adobeId, snapshot }
 */
app.post("/api/submit", async (req, res) => {
  try {
    const { adobeId, snapshot, text, complianceResult } = req.body;

    // Validate input
    if (!adobeId) {
      return res.status(400).json({
        error: "Invalid request",
        message: "adobeId is required",
      });
    }

    // Upsert design - create or update
    const design = await prisma.design.upsert({
      where: { adobeId },
      update: {
        status: "PENDING",
        snapshot: snapshot || undefined,
        text: text || undefined,
        complianceResult: complianceResult || undefined,
      },
      create: {
        adobeId,
        status: "PENDING",
        snapshot: snapshot || null,
        text: text || null,
        complianceResult: complianceResult || null,
      },
    });

    // Create log entry
    await prisma.log.create({
      data: {
        designId: design.id,
        action: "SUBMITTED",
      },
    });

    console.log(`✅ [submit] Design ${adobeId} submitted for approval`);

    res.json({
      success: true,
      message: "Design submitted for approval",
      design: {
        id: design.id,
        adobeId: design.adobeId,
        status: design.status,
      },
    });
  } catch (error) {
    console.error("❌ [submit] Error:", error);
    res.status(500).json({
      error: "Server error",
      message: "Failed to submit design",
    });
  }
});

/**
 * GET /api/status/:adobeId
 * Get the status of a design
 */
app.get("/api/status/:adobeId", async (req, res) => {
  try {
    const { adobeId } = req.params;

    const design = await prisma.design.findUnique({
      where: { adobeId },
      include: {
        logs: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!design) {
      return res.json({
        status: "DRAFT",
        snapshot: null,
        text: null,
        complianceResult: null,
        logs: [],
      });
    }

    res.json({
      status: design.status,
      snapshot: design.snapshot,
      text: design.text,
      complianceResult: design.complianceResult,
      logs: design.logs,
    });
  } catch (error) {
    console.error("❌ [status] Error:", error);
    res.status(500).json({
      error: "Server error",
      message: "Failed to get design status",
    });
  }
});

/**
 * POST /api/review
 * Approve or reject a design
 * Input: { adobeId, decision, feedback }
 * Decision: 'APPROVE' or 'REJECT'
 */
app.post("/api/review", async (req, res) => {
  try {
    const { adobeId, decision, feedback } = req.body;

    // Validate input
    if (!adobeId || !decision) {
      return res.status(400).json({
        error: "Invalid request",
        message: "adobeId and decision are required",
      });
    }

    if (!["APPROVE", "REJECT"].includes(decision.toUpperCase())) {
      return res.status(400).json({
        error: "Invalid request",
        message: "Decision must be 'APPROVE' or 'REJECT'",
      });
    }

    // Find the design
    const design = await prisma.design.findUnique({
      where: { adobeId },
    });

    if (!design) {
      return res.status(404).json({
        error: "Not found",
        message: "Design not found",
      });
    }

    // Determine new status
    const newStatus = decision.toUpperCase() === "APPROVE" 
      ? "APPROVED" 
      : "CHANGES_REQUESTED";

    // Update design status
    const updatedDesign = await prisma.design.update({
      where: { adobeId },
      data: { status: newStatus },
    });

    // Create log entry
    await prisma.log.create({
      data: {
        designId: design.id,
        action: decision.toUpperCase() === "APPROVE" ? "APPROVED" : "REJECTED",
        feedback: feedback || null,
      },
    });

    console.log(`✅ [review] Design ${adobeId} ${newStatus}`);

    res.json({
      success: true,
      message: `Design ${newStatus.toLowerCase().replace("_", " ")}`,
      design: {
        id: updatedDesign.id,
        adobeId: updatedDesign.adobeId,
        status: updatedDesign.status,
      },
    });
  } catch (error) {
    console.error("❌ [review] Error:", error);
    res.status(500).json({
      error: "Server error",
      message: "Failed to review design",
    });
  }
});

// ============================================
// EXISTING ROUTES
// ============================================

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Corporate Brain API",
    timestamp: new Date().toISOString(),
  });
});

// RAG Compliance Check Endpoint
app.post("/check-compliance", async (req, res) => {
  try {
    const { text } = req.body;

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

    const result = await checkCompliance(text);
    res.json(result);
  } catch (error) {
    console.error("❌ [check-compliance] Error:", error);
    res.status(500).json({
      error: "Server error",
      message: "Failed to check compliance",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// API routes
app.use("/api/compliance", complianceRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/rules", rulesRoutes);
app.use("/api/workflow", workflowRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    name: "Corporate Brain API",
    version: "1.0.0",
    description: "AI Compliance Guardian for Adobe Express",
    endpoints: {
      health: "GET /health",
      // Design tracking
      submitDesign: "POST /api/submit",
      getDesignStatus: "GET /api/status/:adobeId",
      reviewDesign: "POST /api/review",
      // Compliance
      checkCompliance: "POST /check-compliance",
      checkComplianceAPI: "POST /api/compliance/check",
      // Documents
      uploadDocument: "POST /api/documents/upload",
      listDocuments: "GET /api/documents",
      // Rules
      listRules: "GET /api/rules",
      // Workflow
      workflow: "/api/workflow/*",
    },
  });
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║                                                   ║
║   🧠 Corporate Brain API Server                   ║
║                                                   ║
║   Running on: http://localhost:${PORT}              ║
║                                                   ║
║   Design Tracking:                                ║
║   • POST /api/submit                              ║
║   • GET  /api/status/:adobeId                     ║
║   • POST /api/review                              ║
║                                                   ║
║   Compliance:                                     ║
║   • POST /check-compliance                        ║
║   • POST /api/compliance/check                    ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
  `);
});
