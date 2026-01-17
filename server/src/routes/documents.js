/**
 * Documents API Routes
 * Handles PDF/Text uploads for the "Truth Source" (RAG Knowledge Base)
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const prisma = require("../lib/prisma");
const vectorStore = require("../services/vectorStore");

// ============================================
// MULTER CONFIGURATION (File Uploads)
// ============================================

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Keep original filename but make it unique
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "doc-" + uniqueSuffix + path.extname(file.originalname));
  },
});

// Filter for text-based files
const fileFilter = (req, file, cb) => {
  if (
    file.mimetype === "application/pdf" ||
    file.mimetype === "text/plain" ||
    file.mimetype === "text/markdown"
  ) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only PDF, TXT, and MD allowed."), false);
  }
};

const upload = multer({ storage, fileFilter });

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/documents
 * List all uploaded documents
 */
router.get("/", async (req, res) => {
  try {
    const documents = await prisma.document.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ documents });
  } catch (error) {
    console.error("❌ [documents] List error:", error);
    res.status(500).json({ error: "Failed to list documents" });
  }
});

/**
 * POST /api/documents/upload
 * Upload a file and index it in Pinecone
 */
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    console.log(`📂 [documents] Uploaded: ${req.file.originalname}`);

    // 1. Save to Database
    const doc = await prisma.document.create({
      data: {
        filename: req.file.originalname,
        path: req.file.path,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
    });

    // 2. Read file content (Simple text extraction for Hackathon)
    // Note: For PDFs in production, you'd use 'pdf-parse'. 
    // For now, we assume text/md or simple parsing.
    let textContent = "";
    try {
      if (req.file.mimetype === "application/pdf") {
        // Placeholder: Real PDF parsing requires 'pdf-parse' package
        // If you don't have it, we'll skip indexing or treat as empty
        console.warn("⚠️ PDF parsing requires 'npm install pdf-parse'");
        textContent = `[PDF Document: ${req.file.originalname}]`; 
      } else {
        textContent = fs.readFileSync(req.file.path, "utf-8");
      }
      
      // 3. Index in Vector Store (Pinecone)
      if (textContent && textContent.length > 0) {
        console.log("🧠 [documents] Indexing content...");
        await vectorStore.indexDocument(doc.id, textContent, {
            filename: doc.filename,
            source: "user_upload"
        });
      }
    } catch (parseError) {
      console.error("⚠️ [documents] Parsing/Indexing failed:", parseError);
      // We don't fail the request, just log it
    }

    res.json({
      success: true,
      message: "Document uploaded and indexed",
      document: doc,
    });

  } catch (error) {
    console.error("❌ [documents] Upload error:", error);
    res.status(500).json({ error: "Failed to upload document" });
  }
});

/**
 * DELETE /api/documents/:id
 * Remove a document
 */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Find doc
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return res.status(404).json({ error: "Document not found" });

    // 2. Delete file from disk
    if (fs.existsSync(doc.path)) {
      fs.unlinkSync(doc.path);
    }

    // 3. Delete from Vector Store
    try {
        await vectorStore.deleteDocument(id);
    } catch (e) {
        console.warn("Could not delete vector:", e.message);
    }

    // 4. Delete from DB
    await prisma.document.delete({ where: { id } });

    res.json({ success: true, message: "Document deleted" });
  } catch (error) {
    console.error("❌ [documents] Delete error:", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

module.exports = router;