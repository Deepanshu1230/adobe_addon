/**
 * Corporate Brain - AI Compliance Guardian
 * Clean Black & White UI for Adobe Express
 */

import "@spectrum-web-components/theme/express/scale-medium.js";
import "@spectrum-web-components/theme/express/theme-light.js";

import { Theme } from "@swc-react/theme";
import React, { useState, useEffect, useRef } from "react";
import "./App.css";

import { AddOnSDKAPI } from "https://new.express.adobe.com/static/add-on-sdk/sdk.js";

const API_BASE = "http://localhost:4000/api";

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
}

interface UploadedDocument {
  id: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

type TabType = "check" | "upload" | "documents";

const App = ({ addOnUISdk }: { addOnUISdk: AddOnSDKAPI }) => {
  const [activeTab, setActiveTab] = useState<TabType>("check");
  const [inputText, setInputText] = useState("");
  const [result, setResult] = useState<ComplianceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [serverStatus, setServerStatus] = useState<"checking" | "online" | "offline">("checking");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { checkServerStatus(); }, []);
  useEffect(() => { if (activeTab === "documents") loadDocuments(); }, [activeTab]);

  async function checkServerStatus() {
    try {
      const res = await fetch(`${API_BASE.replace("/api", "")}/health`);
      setServerStatus(res.ok ? "online" : "offline");
    } catch { setServerStatus("offline"); }
  }

  async function checkCompliance() {
    if (!inputText.trim()) return setError("Please enter text to analyze");
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/compliance/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText }),
      });
      if (!res.ok) throw new Error(`Error: ${res.status}`);
      setResult(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function uploadDocument() {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const res = await fetch(`${API_BASE}/documents/upload`, { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      setUploadSuccess("Document uploaded successfully");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      loadDocuments();
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function loadDocuments() {
    setLoadingDocs(true);
    try {
      const res = await fetch(`${API_BASE}/documents`);
      if (res.ok) setDocuments((await res.json()).documents || []);
    } catch {}
    setLoadingDocs(false);
  }

  async function deleteDocument(id: string) {
    try {
      await fetch(`${API_BASE}/documents/${id}`, { method: "DELETE" });
      setDocuments(documents.filter((d) => d.id !== id));
    } catch {}
  }

  async function loadDocumentText(id: string) {
    try {
      const res = await fetch(`${API_BASE}/documents/${id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.document.textContent) {
          setInputText(data.document.textContent.slice(0, 3000));
          setActiveTab("check");
        }
      }
    } catch {}
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const formatSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(1)} MB`;
  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const severityConfig = {
    high: { bg: "bg-red-50", border: "border-red-500", text: "text-red-600", badge: "bg-red-600" },
    medium: { bg: "bg-amber-50", border: "border-amber-500", text: "text-amber-600", badge: "bg-amber-500" },
    low: { bg: "bg-blue-50", border: "border-blue-500", text: "text-blue-600", badge: "bg-blue-500" },
  };

  return (
    <Theme system="express" scale="medium" color="light">
      <div className="min-h-screen bg-white flex flex-col">
        
        {/* Header */}
        <header className="px-4 py-3 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <h1 className="text-sm font-semibold text-gray-900">Corporate Brain</h1>
                <p className="text-[10px] text-gray-500">Compliance Assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${
                serverStatus === "online" ? "bg-green-500" : serverStatus === "offline" ? "bg-red-500" : "bg-gray-400"
              }`} />
              <span className="text-[10px] text-gray-500">
                {serverStatus === "online" ? "Connected" : serverStatus === "offline" ? "Offline" : "..."}
              </span>
            </div>
          </div>
        </header>

        {/* Tabs */}
        <nav className="px-4 py-2 border-b border-gray-100">
          <div className="flex gap-1">
            {[
              { id: "check", label: "Analyze" },
              { id: "upload", label: "Upload" },
              { id: "documents", label: "Documents" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === tab.id
                    ? "bg-black text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-auto p-4">
          
          {/* Analyze Tab */}
          {activeTab === "check" && (
            <div className="space-y-4">
              {/* Input */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Enter content to check
                </label>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Paste your marketing copy, product descriptions, or any text..."
                  rows={6}
                  disabled={loading}
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg resize-none
                    focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent
                    placeholder:text-gray-400 disabled:bg-gray-50"
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-400">{inputText.length} characters</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setInputText(""); setResult(null); setError(null); }}
                      className="px-4 py-2 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      onClick={checkCompliance}
                      disabled={loading || !inputText.trim() || serverStatus === "offline"}
                      className="px-5 py-2 text-xs font-medium text-white bg-black rounded-lg hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                      {loading ? "Analyzing..." : "Analyze"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              )}

              {/* Results */}
              {result && (
                <div className="space-y-4">
                  {/* Status */}
                  <div className={`p-4 rounded-lg border ${
                    result.isCompliant 
                      ? "bg-green-50 border-green-200" 
                      : "bg-red-50 border-red-200"
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        result.isCompliant ? "bg-green-500" : "bg-red-500"
                      }`}>
                        {result.isCompliant ? (
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${result.isCompliant ? "text-green-700" : "text-red-700"}`}>
                          {result.isCompliant ? "No issues found" : `${result.violations.length} issue${result.violations.length > 1 ? "s" : ""} found`}
                        </p>
                        <p className="text-xs text-gray-500">
                          {result.isCompliant ? "Your content is compliant" : "Review the issues below"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Violations */}
                  {!result.isCompliant && (
                    <div className="space-y-3">
                      {result.violations.map((v, i) => {
                        const cfg = severityConfig[v.severity];
                        return (
                          <div key={v.id || i} className={`p-4 rounded-lg border-l-4 ${cfg.bg} ${cfg.border}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase text-white rounded ${cfg.badge}`}>
                                  {v.severity}
                                </span>
                                <span className={`text-sm font-medium ${cfg.text}`}>"{v.pattern}"</span>
                              </div>
                              <span className="text-[10px] text-gray-500 uppercase">{v.category}</span>
                            </div>
                            <p className="text-xs text-gray-600 mb-3">{v.reason}</p>
                            <div className="flex items-center gap-2 p-2 bg-white rounded border border-gray-200">
                              <span className="text-xs text-gray-500">Suggested:</span>
                              <span className="text-xs font-medium text-gray-900">"{v.suggestion}"</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Suggested Rewrite */}
                  {!result.isCompliant && result.suggestedRewrite !== result.originalText && (
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <h3 className="text-xs font-semibold text-gray-700 mb-2">Corrected Version</h3>
                      <p className="text-sm text-gray-800 leading-relaxed mb-3 p-3 bg-white rounded border border-gray-200">
                        {result.suggestedRewrite}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setInputText(result.suggestedRewrite); setResult(null); }}
                          className="px-4 py-2 text-xs font-medium text-white bg-black rounded-lg hover:bg-gray-800 transition-colors"
                        >
                          Use This
                        </button>
                        <button
                          onClick={() => copyText(result.suggestedRewrite)}
                          className="px-4 py-2 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          {copied ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Upload Tab */}
          {activeTab === "upload" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Upload Document</h2>
                <p className="text-xs text-gray-500 mt-1">Add compliance guidelines to the knowledge base</p>
              </div>

              <div className="relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.doc,.docx"
                  onChange={(e) => { setSelectedFile(e.target.files?.[0] || null); setUploadError(null); setUploadSuccess(null); }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  selectedFile ? "border-black bg-gray-50" : "border-gray-300 hover:border-gray-400"
                }`}>
                  <div className="w-12 h-12 mx-auto mb-3 rounded-lg bg-gray-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-700">
                    {selectedFile ? selectedFile.name : "Click to upload or drag and drop"}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">PDF, TXT, DOC, DOCX up to 50MB</p>
                </div>
              </div>

              {selectedFile && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center">
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700 truncate max-w-[150px]">{selectedFile.name}</p>
                      <p className="text-xs text-gray-400">{formatSize(selectedFile.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={uploadDocument}
                    disabled={uploading}
                    className="px-4 py-2 text-xs font-medium text-white bg-black rounded-lg hover:bg-gray-800 disabled:bg-gray-300"
                  >
                    {uploading ? "Uploading..." : "Upload"}
                  </button>
                </div>
              )}

              {uploadError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">{uploadError}</div>
              )}
              {uploadSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-600">{uploadSuccess}</div>
              )}
            </div>
          )}

          {/* Documents Tab */}
          {activeTab === "documents" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Documents</h2>
                  <p className="text-xs text-gray-500">{documents.length} file{documents.length !== 1 ? "s" : ""}</p>
                </div>
                <button onClick={loadDocuments} disabled={loadingDocs} className="text-xs text-gray-500 hover:text-gray-700">
                  {loadingDocs ? "Loading..." : "Refresh"}
                </button>
              </div>

              {!loadingDocs && documents.length === 0 && (
                <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-lg">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-lg bg-gray-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500 mb-3">No documents yet</p>
                  <button onClick={() => setActiveTab("upload")} className="px-4 py-2 text-xs font-medium text-white bg-black rounded-lg hover:bg-gray-800">
                    Upload Document
                  </button>
                </div>
              )}

              {documents.length > 0 && (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group">
                      <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{doc.originalName}</p>
                        <p className="text-xs text-gray-400">{formatSize(doc.fileSize)} • {formatDate(doc.createdAt)}</p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => loadDocumentText(doc.id)} className="p-2 text-gray-400 hover:text-gray-600 rounded hover:bg-white">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                          </svg>
                        </button>
                        <button onClick={() => deleteDocument(doc.id)} className="p-2 text-gray-400 hover:text-red-500 rounded hover:bg-white">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="px-4 py-2 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 text-center">
            Corporate Brain • AI Compliance Assistant
          </p>
        </footer>
      </div>
    </Theme>
  );
};

export default App;
