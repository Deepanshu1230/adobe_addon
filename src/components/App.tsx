/**
 * Corporate Brain - AI Compliance Guardian
 * Adobe Express Add-on Panel UI
 * 
 * Features:
 * - Text compliance checking
 * - Document upload (PDF, DOC, TXT)
 * - View uploaded documents
 */

// Spectrum Web Components for Express theme
import "@spectrum-web-components/theme/express/scale-medium.js";
import "@spectrum-web-components/theme/express/theme-light.js";

import { Button } from "@swc-react/button";
import { Theme } from "@swc-react/theme";
import React, { useState, useEffect, useRef } from "react";
import "./App.css";

import { AddOnSDKAPI } from "https://new.express.adobe.com/static/add-on-sdk/sdk.js";

// ============================================
// CONFIGURATION
// ============================================

const API_BASE = "http://localhost:4000/api";

// ============================================
// TYPES
// ============================================

interface Violation {
  id: string;
  pattern: string;
  reason: string;
  suggestion: string;
  category: string;
  severity: "low" | "medium" | "high";
}

interface ComplianceResult {
  isCompliant: boolean;
  violations: Violation[];
  suggestedRewrite: string;
  originalText: string;
  checkedAt: string;
}

interface UploadedDocument {
  id: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  vectorId?: string;
}

type TabType = "check" | "upload" | "documents";

// ============================================
// MAIN COMPONENT
// ============================================

const App = ({ addOnUISdk }: { addOnUISdk: AddOnSDKAPI }) => {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>("check");
  
  // Check compliance state
  const [inputText, setInputText] = useState("");
  const [result, setResult] = useState<ComplianceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Document upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Server status
  const [serverStatus, setServerStatus] = useState<"checking" | "online" | "offline">("checking");
  
  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check server status and load documents on mount
  useEffect(() => {
    checkServerStatus();
  }, []);

  // Load documents when switching to documents tab
  useEffect(() => {
    if (activeTab === "documents") {
      loadDocuments();
    }
  }, [activeTab]);

  // ============================================
  // API FUNCTIONS
  // ============================================

  async function checkServerStatus() {
    try {
      const response = await fetch(`${API_BASE.replace("/api", "")}/health`);
      if (response.ok) {
        setServerStatus("online");
      } else {
        setServerStatus("offline");
      }
    } catch {
      setServerStatus("offline");
    }
  }

  async function checkCompliance() {
    if (!inputText.trim()) {
      setError("Please enter some text to check");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${API_BASE}/compliance/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Server error: ${response.status}`);
      }

      const data: ComplianceResult = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Failed to check compliance. Is the server running?");
    } finally {
      setLoading(false);
    }
  }

  async function uploadDocument() {
    if (!selectedFile) {
      setUploadError("Please select a file to upload");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(`${API_BASE}/documents/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Upload failed: ${response.status}`);
      }

      const data = await response.json();
      setUploadSuccess(`✅ "${data.document.filename}" uploaded successfully!`);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      
      // Refresh documents list
      loadDocuments();
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload document");
    } finally {
      setUploading(false);
    }
  }

  async function loadDocuments() {
    setLoadingDocs(true);
    try {
      const response = await fetch(`${API_BASE}/documents`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error("Failed to load documents:", err);
    } finally {
      setLoadingDocs(false);
    }
  }

  async function deleteDocument(id: string) {
    if (!confirm("Are you sure you want to delete this document?")) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/documents/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setDocuments(documents.filter(doc => doc.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  }

  async function checkDocumentCompliance(docId: string) {
    // Fetch document content and check compliance
    try {
      const response = await fetch(`${API_BASE}/documents/${docId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.document.textContent) {
          setInputText(data.document.textContent.slice(0, 2000)); // Limit to 2000 chars
          setActiveTab("check");
        }
      }
    } catch (err) {
      console.error("Failed to fetch document:", err);
    }
  }

  // ============================================
  // UI HELPERS
  // ============================================

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function useSuggestedRewrite() {
    if (result?.suggestedRewrite) {
      setInputText(result.suggestedRewrite);
      setResult(null);
    }
  }

  function clearAll() {
    setInputText("");
    setResult(null);
    setError(null);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadError(null);
      setUploadSuccess(null);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const severityConfig = {
    high: { color: "#dc2626", bg: "#fef2f2", icon: "🚨", label: "HIGH" },
    medium: { color: "#ea580c", bg: "#fff7ed", icon: "⚠️", label: "MEDIUM" },
    low: { color: "#2563eb", bg: "#eff6ff", icon: "ℹ️", label: "LOW" },
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <Theme system="express" scale="medium" color="light">
      <div className="app-container">
        {/* Header */}
        <header className="header">
          <div className="header-content">
            <h1 className="title">🧠 Corporate Brain</h1>
            <p className="subtitle">AI Compliance Guardian</p>
          </div>
          <div className={`status-indicator ${serverStatus}`}>
            <span className="status-dot"></span>
            <span className="status-text">
              {serverStatus === "checking" ? "..." : 
               serverStatus === "online" ? "Online" : "Offline"}
            </span>
          </div>
        </header>

        {/* Tab Navigation */}
        <nav className="tab-nav">
          <button
            className={`tab-btn ${activeTab === "check" ? "active" : ""}`}
            onClick={() => setActiveTab("check")}
          >
            🔍 Check Text
          </button>
          <button
            className={`tab-btn ${activeTab === "upload" ? "active" : ""}`}
            onClick={() => setActiveTab("upload")}
          >
            📤 Upload Doc
          </button>
          <button
            className={`tab-btn ${activeTab === "documents" ? "active" : ""}`}
            onClick={() => setActiveTab("documents")}
          >
            📁 Documents
          </button>
        </nav>

        {/* Main Content */}
        <main className="main-content">
          
          {/* ========== CHECK TEXT TAB ========== */}
          {activeTab === "check" && (
            <div className="tab-content">
              <section className="input-section">
                <label className="input-label">
                  Enter marketing copy to check:
                </label>
                <textarea
                  className="text-input"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Example: Our new phone is 100% waterproof and guaranteed to never fail..."
                  rows={5}
                  disabled={loading}
                />
                <div className="char-count">{inputText.length} characters</div>
              </section>

              <div className="button-group">
                <Button
                  variant="accent"
                  size="m"
                  onClick={checkCompliance}
                  disabled={loading || !inputText.trim() || serverStatus === "offline"}
                >
                  {loading ? "⏳ Checking..." : "🔍 Check Compliance"}
                </Button>
                <Button variant="secondary" size="m" onClick={clearAll} disabled={loading}>
                  Clear
                </Button>
              </div>

              {serverStatus === "offline" && (
                <div className="warning-banner">
                  ⚠️ Server offline. Run: <code>cd server && npm run dev</code>
                </div>
              )}

              {error && <div className="error-banner">❌ {error}</div>}

              {/* Results */}
              {result && (
                <section className="results-section">
                  <div className={`status-badge ${result.isCompliant ? "compliant" : "non-compliant"}`}>
                    {result.isCompliant ? (
                      <>✅ All Clear - No Issues</>
                    ) : (
                      <>❌ {result.violations.length} Issue{result.violations.length > 1 ? "s" : ""} Found</>
                    )}
                  </div>

                  {!result.isCompliant && (
                    <div className="violations-container">
                      {result.violations.map((violation, index) => {
                        const config = severityConfig[violation.severity];
                        return (
                          <div 
                            key={violation.id || index}
                            className="violation-card"
                            style={{ borderLeftColor: config.color }}
                          >
                            <div className="violation-header">
                              <span>{config.icon}</span>
                              <span className="violation-pattern">"{violation.pattern}"</span>
                              <span className="severity-tag" style={{ backgroundColor: config.color }}>
                                {config.label}
                              </span>
                            </div>
                            <p className="violation-reason">{violation.reason}</p>
                            <div className="violation-suggestion">
                              ✏️ Use "{violation.suggestion}" instead
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!result.isCompliant && result.suggestedRewrite !== result.originalText && (
                    <div className="rewrite-container">
                      <h3 className="section-title">✨ Suggested Version:</h3>
                      <div className="rewrite-box">
                        <p>{result.suggestedRewrite}</p>
                      </div>
                      <div className="rewrite-actions">
                        <Button variant="primary" size="s" onClick={useSuggestedRewrite}>
                          📝 Use This
                        </Button>
                        <Button variant="secondary" size="s" onClick={() => copyToClipboard(result.suggestedRewrite)}>
                          {copied ? "✅ Copied!" : "📋 Copy"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {result.isCompliant && (
                    <div className="success-message">
                      <span className="success-icon">🎉</span>
                      <p>Your copy looks great!</p>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {/* ========== UPLOAD DOCUMENT TAB ========== */}
          {activeTab === "upload" && (
            <div className="tab-content">
              <div className="upload-section">
                <div className="upload-header">
                  <h3>📤 Upload Truth Source Document</h3>
                  <p>Upload your company guidelines, legal docs, or product manuals.</p>
                </div>

                <div className="file-input-wrapper">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,.doc,.docx"
                    onChange={handleFileSelect}
                    className="file-input"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="file-input-label">
                    <span className="file-icon">📄</span>
                    <span className="file-text">
                      {selectedFile ? selectedFile.name : "Choose a file..."}
                    </span>
                    <span className="file-hint">PDF, TXT, DOC, DOCX (max 10MB)</span>
                  </label>
                </div>

                {selectedFile && (
                  <div className="selected-file-info">
                    <span className="file-name">{selectedFile.name}</span>
                    <span className="file-size">{formatFileSize(selectedFile.size)}</span>
                  </div>
                )}

                <Button
                  variant="accent"
                  size="m"
                  onClick={uploadDocument}
                  disabled={uploading || !selectedFile || serverStatus === "offline"}
                >
                  {uploading ? "⏳ Uploading..." : "📤 Upload Document"}
                </Button>

                {uploadError && <div className="error-banner">❌ {uploadError}</div>}
                {uploadSuccess && <div className="success-banner">{uploadSuccess}</div>}

                <div className="upload-info">
                  <h4>How it works:</h4>
                  <ol>
                    <li>Upload your company's guidelines or legal documents</li>
                    <li>Text is extracted and indexed for compliance checking</li>
                    <li>Future: RAG will use these as the "truth source"</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* ========== DOCUMENTS LIST TAB ========== */}
          {activeTab === "documents" && (
            <div className="tab-content">
              <div className="documents-section">
                <div className="documents-header">
                  <h3>📁 Uploaded Documents</h3>
                  <Button variant="secondary" size="s" onClick={loadDocuments} disabled={loadingDocs}>
                    🔄 Refresh
                  </Button>
                </div>

                {loadingDocs && <div className="loading-text">Loading documents...</div>}

                {!loadingDocs && documents.length === 0 && (
                  <div className="empty-state">
                    <span className="empty-icon">📭</span>
                    <p>No documents uploaded yet</p>
                    <Button variant="primary" size="s" onClick={() => setActiveTab("upload")}>
                      Upload First Document
                    </Button>
                  </div>
                )}

                {!loadingDocs && documents.length > 0 && (
                  <div className="documents-list">
                    {documents.map((doc) => (
                      <div key={doc.id} className="document-card">
                        <div className="document-icon">
                          {doc.mimeType?.includes("pdf") ? "📕" : 
                           doc.mimeType?.includes("text") ? "📄" : "📝"}
                        </div>
                        <div className="document-info">
                          <span className="document-name">{doc.originalName}</span>
                          <span className="document-meta">
                            {formatFileSize(doc.fileSize)} • {formatDate(doc.createdAt)}
                          </span>
                        </div>
                        <div className="document-actions">
                          <button
                            className="doc-action-btn check"
                            onClick={() => checkDocumentCompliance(doc.id)}
                            title="Check this document"
                          >
                            🔍
                          </button>
                          <button
                            className="doc-action-btn delete"
                            onClick={() => deleteDocument(doc.id)}
                            title="Delete document"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="footer">
          <p>Powered by Corporate Brain • RAG-Ready</p>
        </footer>
      </div>
    </Theme>
  );
};

export default App;
