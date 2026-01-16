/**
 * PDF Ingestion Script
 * 
 * Reads PDF files from server/uploads/, extracts text, chunks it,
 * generates embeddings, and upserts to Pinecone.
 * 
 * Usage: node scripts/ingest-pdf.js [filename]
 * If no filename provided, will look for files starting with "doc-"
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const vectorStore = require("../src/services/vectorStore");

/**
 * Find PDF files in uploads directory
 * @param {string} uploadsDir - Path to uploads directory
 * @param {string} filename - Optional specific filename to look for
 * @returns {string[]} Array of PDF file paths
 */
function findPDFFiles(uploadsDir, filename = null) {
  const files = fs.readdirSync(uploadsDir);
  
  if (filename) {
    // Look for specific file
    const filePath = path.join(uploadsDir, filename);
    if (fs.existsSync(filePath) && filename.toLowerCase().endsWith(".pdf")) {
      return [filePath];
    }
    console.warn(`⚠️ File not found: ${filename}`);
    return [];
  }
  
  // Find all PDFs starting with "doc-"
  return files
    .filter((file) => file.toLowerCase().endsWith(".pdf") && file.startsWith("doc-"))
    .map((file) => path.join(uploadsDir, file));
}

/**
 * Extract text from PDF file
 * @param {string} filePath - Path to PDF file
 * @returns {Promise<string>} Extracted text
 */
async function extractTextFromPDF(filePath) {
  try {
    console.log(`📄 Reading PDF: ${path.basename(filePath)}`);
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    
    console.log(`   ✅ Extracted ${data.text.length} characters`);
    console.log(`   📊 Pages: ${data.numpages}`);
    
    return data.text;
  } catch (error) {
    console.error(`❌ Failed to parse PDF ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Generate a document ID from filename
 * @param {string} filePath - Path to PDF file
 * @returns {string} Document ID
 */
function generateDocId(filePath) {
  const filename = path.basename(filePath, ".pdf");
  // Use filename as docId, or generate timestamp-based ID
  return filename || `doc-${Date.now()}`;
}

/**
 * Main ingestion function
 */
async function ingestPDF() {
  try {
    // Validate environment variables
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set in environment variables");
    }
    if (!process.env.PINECONE_API_KEY) {
      throw new Error("PINECONE_API_KEY is not set in environment variables");
    }

    // Get uploads directory
    const uploadsDir = path.join(__dirname, "../uploads");
    if (!fs.existsSync(uploadsDir)) {
      throw new Error(`Uploads directory not found: ${uploadsDir}`);
    }

    // Find PDF files
    const filename = process.argv[2] || null;
    const pdfFiles = findPDFFiles(uploadsDir, filename);

    if (pdfFiles.length === 0) {
      console.log("⚠️ No PDF files found to ingest.");
      console.log(`   Looking in: ${uploadsDir}`);
      console.log(`   Pattern: files starting with "doc-" or specify filename as argument`);
      process.exit(1);
    }

    console.log(`\n🚀 Starting PDF ingestion...`);
    console.log(`   Found ${pdfFiles.length} PDF file(s)\n`);

    // Connect to vector store
    console.log("🔌 Connecting to Pinecone...");
    await vectorStore.connect();
    console.log("   ✅ Connected\n");

    // Process each PDF
    for (const filePath of pdfFiles) {
      try {
        const filename = path.basename(filePath);
        const docId = generateDocId(filePath);

        console.log(`\n📦 Processing: ${filename}`);
        console.log(`   Document ID: ${docId}`);

        // Extract text from PDF
        const text = await extractTextFromPDF(filePath);

        if (!text || text.trim().length === 0) {
          console.warn(`   ⚠️ No text extracted from ${filename}, skipping...`);
          continue;
        }

        // Index document in Pinecone
        console.log(`\n📤 Indexing document in Pinecone...`);
        const vectorId = await vectorStore.indexDocument(docId, text, {
          filename,
          source: "pdf",
          ingestedAt: new Date().toISOString(),
        });

        console.log(`\n✅ Successfully ingested: ${filename}`);
        console.log(`   Vector ID: ${vectorId}`);
        console.log(`   Document ID: ${docId}\n`);

      } catch (error) {
        console.error(`\n❌ Failed to process ${path.basename(filePath)}:`, error.message);
        console.error(`   Continuing with next file...\n`);
      }
    }

    console.log("\n✨ Ingestion complete!\n");

  } catch (error) {
    console.error("\n❌ Ingestion failed:", error.message);
    process.exit(1);
  }
}

// Run ingestion
if (require.main === module) {
  ingestPDF();
}

module.exports = { ingestPDF, extractTextFromPDF, findPDFFiles };
