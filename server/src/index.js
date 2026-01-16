/**
 * Corporate Brain - Express Server
 * Main entry point for the backend API
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

// Import routes
const complianceRoutes = require("./routes/compliance");
const documentsRoutes = require("./routes/documents");
const rulesRoutes = require("./routes/rules");

// Initialize Express app
const app = express();

// ============================================
// MIDDLEWARE
// ============================================

// CORS - Allow requests from Adobe Express add-on
app.use(cors({
  origin: "*", // Allow all origins for hackathon demo
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Parse JSON bodies
app.use(express.json());

// Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// ============================================
// ROUTES
// ============================================

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    service: "Corporate Brain API",
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use("/api/compliance", complianceRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/rules", rulesRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    name: "Corporate Brain API",
    version: "1.0.0",
    description: "AI Compliance Guardian for Adobe Express",
    endpoints: {
      health: "GET /health",
      checkCompliance: "POST /api/compliance/check",
      uploadDocument: "POST /api/documents/upload",
      listDocuments: "GET /api/documents",
      listRules: "GET /api/rules",
    }
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
    message: process.env.NODE_ENV === "development" ? err.message : undefined
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
║   Endpoints:                                      ║
║   • POST /api/compliance/check                    ║
║   • POST /api/documents/upload                    ║
║   • GET  /api/documents                           ║
║   • GET  /api/rules                               ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
  `);
});
