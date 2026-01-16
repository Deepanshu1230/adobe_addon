/**
 * Vector Store Service - Pinecone Integration (Optimized)
 * * Handles document indexing and semantic search using Pinecone vector database.
 * Uses Google Generative AI embeddings (embedding-001) for vector generation.
 */

require("dotenv").config();
const { Pinecone } = require("@pinecone-database/pinecone");
const { GoogleGenerativeAI } = require("@google/generative-ai");

class VectorStore {
  constructor() {
    this.isConnected = false;
    this.provider = "pinecone";
    this.pinecone = null;
    this.index = null;
    this.genAI = null;
    this.embeddingModel = null;
  }

  async connect() {
    try {
      if (!process.env.GOOGLE_API_KEY)
        throw new Error("GOOGLE_API_KEY missing");
      if (!process.env.PINECONE_API_KEY)
        throw new Error("PINECONE_API_KEY missing");

      // Initialize Gemini
      this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
      this.embeddingModel = this.genAI.getGenerativeModel({
        model: "text-embedding-004",
      });

      // Initialize Pinecone
      this.pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

      // CRITICAL: Ensure we use the correct index from .env
      const indexName = process.env.PINECONE_INDEX;
      if (!indexName) throw new Error("PINECONE_INDEX is not set in .env");

      this.index = this.pinecone.index(indexName);
      this.isConnected = true;
      console.log(`✅ [VectorStore] Connected to Pinecone index: ${indexName}`);
      return true;
    } catch (error) {
      console.error("❌ [VectorStore] Connection failed:", error.message);
      throw error;
    }
  }

  async generateEmbedding(text) {
    try {
      // Clean newlines to avoid embedding issues
      const cleanText = text.replace(/\n/g, " ");
      const result = await this.embeddingModel.embedContent(cleanText);
      const embedding = result.embedding?.values || result.embedding || result;
      return embedding;
    } catch (error) {
      console.error(
        "❌ [VectorStore] Embedding generation failed:",
        error.message
      );
      throw error;
    }
  }

  /**
   * Smarter Chunking: Respects word boundaries
   */
  chunkText(text, chunkSize = 1000, overlap = 100) {
    const chunks = [];
    if (!text) return chunks;

    let start = 0;
    while (start < text.length) {
      let end = start + chunkSize;

      // If we are not at the end of text, try to find a space to break at
      if (end < text.length) {
        const lastSpace = text.lastIndexOf(" ", end);
        // Only snap to space if it's reasonably close (within last 20% of chunk)
        if (lastSpace > start + chunkSize * 0.8) {
          end = lastSpace;
        }
      }

      const chunk = text.slice(start, end).trim();
      if (chunk.length > 0) chunks.push(chunk);

      // Move start forward, minus overlap
      start = end - overlap;
    }
    return chunks;
  }

  async indexDocument(docId, text, metadata = {}) {
    if (!this.isConnected) await this.connect();

    try {
      console.log(
        `📥 [VectorStore] Indexing ${docId} (${text.length} chars)...`
      );
      const chunks = this.chunkText(text);

      const vectors = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        // 🛑 RATE LIMIT FIX: Wait 2 seconds before each request
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Retry logic for 429 errors
        let embedding;
        try {
          embedding = await this.generateEmbedding(chunk);
        } catch (e) {
          console.log("   ⚠️ Hit rate limit. Waiting 60 seconds...");
          await new Promise((resolve) => setTimeout(resolve, 60000)); // Wait 1 min
          embedding = await this.generateEmbedding(chunk); // Try once more
        }

        vectors.push({
          id: `${docId}_chunk_${i}`,
          values: embedding,
          metadata: {
            docId,
            chunkIndex: i,
            text: chunk,
            ...metadata,
          },
        });
        console.log(`   Processed chunk ${i + 1}/${chunks.length}`);
      }

      // Batch Upload to Pinecone
      const batchSize = 100;
      for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize);
        await this.index.upsert(batch);
      }

      console.log(`   ✅ Indexed ${vectors.length} chunks`);
      return true;
    } catch (error) {
      console.error(`❌ [VectorStore] Indexing failed:`, error.message);
      throw error;
    }
  }

  async search(query, topK = 3) {
    if (!this.isConnected) await this.connect();

    try {
      const queryEmbedding = await this.generateEmbedding(query);

      const queryResponse = await this.index.query({
        vector: queryEmbedding,
        topK,
        includeMetadata: true,
      });

      return queryResponse.matches.map((match) => ({
        text: match.metadata?.text || "",
        score: match.score,
        docId: match.metadata?.docId || "",
        metadata: match.metadata || {},
      }));
    } catch (error) {
      console.error("❌ [VectorStore] Search failed:", error.message);
      return []; // Return empty array instead of crashing
    }
  }

  /**
   * OPTIMIZED: Uses Native "Delete by Filter"
   */
  async deleteDocument(docId) {
    if (!this.isConnected) await this.connect();

    try {
      console.log(`🗑️ [VectorStore] Deleting docId: ${docId}`);

      // Much faster: Delete by metadata filter directly
      await this.index.deleteMany({ docId: { $eq: docId } });

      console.log(`   ✅ Deleted vectors for ${docId}`);
      return true;
    } catch (error) {
      console.error(`❌ [VectorStore] Delete failed:`, error.message);
      throw error;
    }
  }

  async getStats() {
    if (!this.isConnected) await this.connect();
    try {
      // Pinecone v3 has a stats endpoint
      const stats = await this.index.describeIndexStats();
      return {
        provider: "pinecone",
        indexName: process.env.PINECONE_INDEX,
        totalVectors: stats.totalRecordCount,
        namespaces: stats.namespaces,
      };
    } catch (e) {
      return { error: e.message };
    }
  }
}

module.exports = new VectorStore();
