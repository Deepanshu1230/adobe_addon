/**
 * Documents API Routes
 * 
 * POST /api/documents/upload - Upload a "truth source" document
 * GET  /api/documents - List all documents
 * DELETE /api/documents/:id - Delete a document
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const prisma = require("../lib/prisma");
const vectorStore = require("../services/vectorStore");

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Sanitize text for UTF-8 database storage
 * Removes null bytes and other invalid characters
 */
function sanitizeText(text) {
  if (!text) return "";
  return text
    .replace(/\x00/g, "")           // Remove null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ")  // Replace control chars with space
    .replace(/\uFFFD/g, "")         // Remove replacement characters
    .trim();
}

// ============================================
// MULTER CONFIGURATION
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
    // Generate unique filename
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `doc-${uniqueSuffix}${ext}`);
  },
});

// File filter - only allow specific types
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only PDF, TXT, DOC, DOCX are allowed."), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
});

// ============================================
// ROUTES
// ============================================

/**
 * POST /api/documents/upload
 * Upload a "truth source" document
 */
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded",
        message: "Please select a file to upload",
      });
    }

    const { filename, originalname, mimetype, size } = req.file;

    // Extract text from document (simplified for demo)
    let textContent = "";
    try {
      if (mimetype === "application/pdf") {
        // For PDFs, use pdf-parse
        const pdfParse = require("pdf-parse");
        const dataBuffer = fs.readFileSync(path.join(uploadDir, filename));
        const pdfData = await pdfParse(dataBuffer);
        textContent = pdfData.text;
      } else if (mimetype === "text/plain") {
        // For text files, read directly
        textContent = fs.readFileSync(path.join(uploadDir, filename), "utf-8");
      } else {
        // For other types, placeholder
        textContent = `[Content from ${originalname}]`;
      }
    } catch (extractError) {
      console.warn("⚠️ Could not extract text:", extractError.message);
      textContent = `[Could not extract text from ${originalname}]`;
    }

    // Sanitize text content to remove invalid UTF-8 characters
    textContent = sanitizeText(textContent);

    // Save to database
    const document = await prisma.document.create({
      data: {
        filename,
        originalName: originalname,
        mimeType: mimetype,
        textContent,
        fileSize: size,
      },
    });

    // Index in vector store (for RAG - currently a stub)
    let vectorId = null;
    try {
      vectorId = await vectorStore.indexDocument(
        document.id,
        textContent,
        { filename: originalname }
      );
      
      // Update document with vector ID
      await prisma.document.update({
        where: { id: document.id },
        data: { vectorId },
      });
    } catch (vectorError) {
      console.warn("⚠️ Vector indexing skipped:", vectorError.message);
    }

    res.status(201).json({
      message: "Document uploaded successfully",
      document: {
        id: document.id,
        filename: document.originalName,
        mimeType: document.mimeType,
        fileSize: document.fileSize,
        textLength: textContent.length,
        vectorId,
        createdAt: document.createdAt,
      },
    });

  } catch (error) {
    console.error("❌ [documents/upload] Error:", error);
    res.status(500).json({
      error: "Upload failed",
      message: error.message,
    });
  }
});

/**
 * GET /api/documents
 * List all uploaded documents
 */
router.get("/", async (req, res) => {
  try {
    const documents = await prisma.document.findMany({
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        fileSize: true,
        createdAt: true,
        vectorId: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({
      count: documents.length,
      documents,
    });

  } catch (error) {
    console.error("❌ [documents/list] Error:", error);
    res.status(500).json({
      error: "Failed to list documents",
    });
  }
});

/**
 * GET /api/documents/:id
 * Get a specific document
 */
router.get("/:id", async (req, res) => {
  try {
    const document = await prisma.document.findUnique({
      where: { id: req.params.id },
    });

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.json({ document });

  } catch (error) {
    console.error("❌ [documents/get] Error:", error);
    res.status(500).json({ error: "Failed to get document" });
  }
});

/**
 * DELETE /api/documents/:id
 * Delete a document
 */
router.delete("/:id", async (req, res) => {
  try {
    const document = await prisma.document.findUnique({
      where: { id: req.params.id },
    });

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Delete from vector store
    if (document.vectorId) {
      try {
        await vectorStore.deleteDocument(document.vectorId);
      } catch (e) {
        console.warn("⚠️ Could not delete from vector store:", e.message);
      }
    }

    // Delete file from disk
    const filePath = path.join(uploadDir, document.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    await prisma.document.delete({
      where: { id: req.params.id },
    });

    res.json({ message: "Document deleted successfully" });

  } catch (error) {
    console.error("❌ [documents/delete] Error:", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

// Error handler for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "File too large",
        message: "Maximum file size is 50MB",
      });
    }
  }
  next(error);
});

module.exports = router;
