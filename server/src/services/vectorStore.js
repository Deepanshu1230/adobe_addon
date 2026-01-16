/**
 * Vector Store Service - Pinecone Integration
 * 
 * Handles document indexing and semantic search using Pinecone vector database.
 * Uses OpenAI embeddings for vector generation.
 */

require("dotenv").config();
const { Pinecone } = require("@pinecone-database/pinecone");
const OpenAI = require("openai");

class VectorStore {
  constructor() {
    this.isConnected = false;
    this.provider = "pinecone";
    this.pinecone = null;
    this.index = null;
    this.openai = null;
  }

  /**
   * Initialize connection to Pinecone and OpenAI
   */
  async connect() {
    try {
      // Initialize OpenAI
      if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is not set in environment variables");
      }
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      // Initialize Pinecone
      if (!process.env.PINECONE_API_KEY) {
        throw new Error("PINECONE_API_KEY is not set in environment variables");
      }
      this.pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

      // Get index name from env or use default
      const indexName = process.env.PINECONE_INDEX || "corporate-brain";
      this.index = this.pinecone.index(indexName);

      this.isConnected = true;
      console.log(`✅ [VectorStore] Connected to Pinecone index: ${indexName}`);
      return true;
    } catch (error) {
      console.error("❌ [VectorStore] Connection failed:", error.message);
      throw error;
    }
  }

  /**
   * Generate embedding for text using OpenAI
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} Embedding vector
   */
  async generateEmbedding(text) {
    try {
      const response = await this.openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: text,
      });
      return response.data[0].embedding;
    } catch (error) {
      console.error("❌ [VectorStore] Embedding generation failed:", error.message);
      throw error;
    }
  }

  /**
   * Chunk text into smaller pieces for indexing
   * @param {string} text - Full text to chunk
   * @param {number} chunkSize - Size of each chunk in characters
   * @param {number} overlap - Overlap between chunks in characters
   * @returns {string[]} Array of text chunks
   */
  chunkText(text, chunkSize = 500, overlap = 50) {
    const chunks = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunk = text.slice(start, end).trim();
      
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
      
      start = end - overlap;
      if (start >= text.length) break;
    }

    return chunks;
  }

  /**
   * Index a document's text chunks with embeddings
   * 
   * @param {string} docId - Document ID from your database
   * @param {string} text - Full text content to index
   * @param {object} metadata - Additional metadata (filename, etc.)
   * @returns {Promise<string>} Vector store reference ID
   */
  async indexDocument(docId, text, metadata = {}) {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      console.log(`📥 [VectorStore] Indexing document ${docId}...`);
      console.log(`   Text length: ${text.length} characters`);

      // Chunk the text
      const chunks = this.chunkText(text);
      console.log(`   Created ${chunks.length} chunks`);

      // Generate embeddings for each chunk
      const vectors = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = await this.generateEmbedding(chunk);
        
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
      }

      // Upsert vectors to Pinecone in batches (Pinecone supports up to 100 vectors per upsert)
      const batchSize = 100;
      for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize);
        await this.index.upsert(batch);
        console.log(`   ✅ Upserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(vectors.length / batchSize)}`);
      }

      const vectorId = `vec_${docId}_${Date.now()}`;
      console.log(`   ✅ Indexed ${vectors.length} chunks for document ${docId}`);
      return vectorId;
    } catch (error) {
      console.error(`❌ [VectorStore] Indexing failed for ${docId}:`, error.message);
      throw error;
    }
  }

  /**
   * Search for relevant document chunks given a query
   * 
   * @param {string} query - The text to search for
   * @param {number} topK - Number of results to return
   * @returns {Promise<Array<{text: string, score: number, docId: string, metadata: object}>>}
   */
  async search(query, topK = 3) {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      console.log(`🔍 [VectorStore] Searching for: "${query.slice(0, 50)}..."`);

      // Generate embedding for query
      const queryEmbedding = await this.generateEmbedding(query);

      // Query Pinecone
      const queryResponse = await this.index.query({
        vector: queryEmbedding,
        topK,
        includeMetadata: true,
      });

      // Format results
      const results = queryResponse.matches.map((match) => ({
        text: match.metadata?.text || "",
        score: match.score,
        docId: match.metadata?.docId || "",
        metadata: match.metadata || {},
      }));

      console.log(`   ✅ Found ${results.length} results`);
      return results;
    } catch (error) {
      console.error("❌ [VectorStore] Search failed:", error.message);
      throw error;
    }
  }

  /**
   * Delete all vectors for a document
   * 
   * @param {string} docId - Document ID
   */
  async deleteDocument(docId) {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      console.log(`🗑️ [VectorStore] Deleting vectors for: ${docId}`);

      // Query for all vectors with this docId
      const queryEmbedding = new Array(1536).fill(0); // Ada-002 embedding dimension
      const queryResponse = await this.index.query({
        vector: queryEmbedding,
        topK: 10000,
        filter: { docId: { $eq: docId } },
        includeMetadata: true,
      });

      // Delete all matching vectors
      if (queryResponse.matches.length > 0) {
        const idsToDelete = queryResponse.matches.map((m) => m.id);
        await this.index.deleteMany(idsToDelete);
        console.log(`   ✅ Deleted ${idsToDelete.length} vectors`);
      } else {
        console.log(`   ⚠️ No vectors found for document ${docId}`);
      }

      return true;
    } catch (error) {
      console.error(`❌ [VectorStore] Deletion failed for ${docId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get stats about the vector store
   */
  async getStats() {
    try {
      // Pinecone doesn't provide a direct stats API, so we return basic info
      return {
        provider: this.provider,
        isConnected: this.isConnected,
        indexName: process.env.PINECONE_INDEX || "corporate-brain",
      };
    } catch (error) {
      return {
        provider: this.provider,
        isConnected: false,
        error: error.message,
      };
    }
  }
}

// Export singleton instance
module.exports = new VectorStore();
