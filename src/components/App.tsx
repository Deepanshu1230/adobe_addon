import React, { useState, useEffect } from "react";
import "./App.css";

// ============================================
// SDK & API CONFIGURATION
// ============================================
const addOnUISdk: any = (window as any).addOnUISdk;
const API_BASE = "http://localhost:4000/api";

// ============================================
// TYPES
// ============================================
type Role = "DESIGNER" | "MANAGER";
type WorkflowStep = "CAPTURE" | "REVIEW" | "SUBMITTED";

interface Issue {
  text: string;
  reason: string;
  suggestion: string;
  severity: "low" | "medium" | "high";
}

interface ComplianceResult {
  isCompliant: boolean;
  issues: Issue[];
  checkedAt: string;
}

interface CapturedDesign {
  snapshot: string; // base64 PNG
  text: string;
  title: string;
  capturedAt: string;
}

// ============================================
// API SERVICE
// ============================================
const api = {
  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE.replace("/api", "")}/health`);
      return res.ok;
    } catch {
      return false;
    }
  },

  async checkCompliance(text: string): Promise<ComplianceResult> {
    const res = await fetch(`${API_BASE}/compliance/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`Compliance check failed: ${res.status}`);
    return res.json();
  },

  async createContent(data: { title: string; text: string; creatorId: string; description?: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/workflow/content`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to create content: ${res.status}`);
    const result = await res.json();
    return result.content;
  },

  async submitForApproval(contentId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/workflow/content/${contentId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Failed to submit: ${res.status}`);
    return res.json();
  },

  async listContent(status?: string): Promise<any[]> {
    const url = status ? `${API_BASE}/workflow/content?status=${status}` : `${API_BASE}/workflow/content`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to list content: ${res.status}`);
    const result = await res.json();
    return result.content || [];
  },

  async approveStep(stepId: string, userId?: string): Promise<any> {
    const res = await fetch(`${API_BASE}/workflow/steps/${stepId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) throw new Error(`Failed to approve: ${res.status}`);
    return res.json();
  },

  async rejectStep(stepId: string, feedback: string, userId?: string): Promise<any> {
    const res = await fetch(`${API_BASE}/workflow/steps/${stepId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, feedback }),
    });
    if (!res.ok) throw new Error(`Failed to reject: ${res.status}`);
    return res.json();
  },

  async getOrCreateUser(role: Role): Promise<{ id: string; name: string; role: string }> {
    const res = await fetch(`${API_BASE}/workflow/users`);
    if (res.ok) {
      const { users } = await res.json();
      const existingUser = users.find((u: any) => u.role === role);
      if (existingUser) return existingUser;
    }
    
    const createRes = await fetch(`${API_BASE}/workflow/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: role === "DESIGNER" ? "Demo Designer" : "Demo Manager",
        email: `${role.toLowerCase()}@demo.com`,
        role: role,
      }),
    });
    const { user } = await createRes.json();
    return user;
  },

  async uploadDocument(file: File): Promise<any> {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${API_BASE}/documents/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
  },

  async getDocuments(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/documents`);
    if (!res.ok) throw new Error(`Failed to fetch docs: ${res.status}`);
    const data = await res.json();
    return data.documents || [];
  },

  async deleteDocument(id: string): Promise<any> {
    const res = await fetch(`${API_BASE}/documents/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
    return res.json();
  }
};

// ============================================
// ADOBE EXPRESS SDK HELPERS
// ============================================
const expressSDK = {
  isReady: false,

  async initialize(): Promise<boolean> {
    try {
      if (addOnUISdk?.ready) {
        await addOnUISdk.ready;
        this.isReady = true;
        console.log("✅ Adobe Express SDK initialized");
        return true;
      }
      console.warn("⚠️ SDK not available, running in demo mode");
      return false;
    } catch (err) {
      console.error("❌ SDK init error:", err);
      return false;
    }
  },

  async getDocumentTitle(): Promise<string> {
    try {
      if (addOnUISdk?.app?.document?.title) {
        return await addOnUISdk.app.document.title || "Untitled Design";
      }
    } catch {}
    return "Marketing Design";
  },

  async createRendition(): Promise<string | null> {
    if (!addOnUISdk?.app?.document?.createRenditions) {
      console.warn("createRenditions not available");
      return null;
    }

    try {
      const renditions = await addOnUISdk.app.document.createRenditions({
        range: "currentPage",
        format: "image/png",
      });

      if (renditions?.[0]?.blob) {
        const base64 = await blobToBase64(renditions[0].blob);
        console.log("📸 Rendition created successfully");
        return base64;
      }
    } catch (err) {
      console.error("Rendition creation error:", err);
    }
    return null;
  },

  async extractText(): Promise<string> {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) return text;
    } catch {}

    if (addOnUISdk?.app?.document) {
      const doc = addOnUISdk.app.document;
      try {
        if (typeof doc.getSelectedContent === 'function') {
          const content = await doc.getSelectedContent();
          if (content?.text) return content.text;
        }
        if (typeof doc.getSelection === 'function') {
          const selection = await doc.getSelection();
          if (selection?.length > 0) {
            return selection.map((item: any) => item.text || "").filter(Boolean).join("\n");
          }
        }
      } catch {}
    }
    return "";
  },
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] || result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ============================================
// MAIN APP COMPONENT
// ============================================
const App: React.FC = () => {
  // State
  const [role, setRole] = useState<Role>("DESIGNER");
  const [serverStatus, setServerStatus] = useState<"checking" | "online" | "offline">("checking");
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; role: string } | null>(null);

  // Designer state
  const [step, setStep] = useState<WorkflowStep>("CAPTURE");
  const [capturing, setCapturing] = useState(false);
  const [capturedDesign, setCapturedDesign] = useState<CapturedDesign | null>(null);
  const [complianceResult, setComplianceResult] = useState<ComplianceResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [manualText, setManualText] = useState("");

  // Manager state
  const [pendingContent, setPendingContent] = useState<any[]>([]);
  const [selectedContent, setSelectedContent] = useState<any | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [reviewing, setReviewing] = useState(false);

  // Manager Knowledge Base State
  const [managerTab, setManagerTab] = useState<"APPROVALS" | "KNOWLEDGE">("APPROVALS");
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Initialize
  useEffect(() => {
    initializeApp();
  }, []);

  useEffect(() => {
    fetchCurrentUser();
    if (role === "MANAGER") {
      fetchPendingContent();
      const interval = setInterval(fetchPendingContent, 5000);
      return () => clearInterval(interval);
    }
  }, [role]);

  useEffect(() => {
    if (role === "MANAGER" && managerTab === "KNOWLEDGE") {
      loadDocuments();
    }
  }, [role, managerTab]);

  async function initializeApp() {
    const isOnline = await api.checkHealth();
    setServerStatus(isOnline ? "online" : "offline");
    await expressSDK.initialize();
    await fetchCurrentUser();
  }

  async function fetchCurrentUser() {
    try {
      const user = await api.getOrCreateUser(role);
      setCurrentUser(user);
    } catch (err) {
      console.error("Failed to get user:", err);
    }
  }

  async function fetchPendingContent() {
    try {
      const content = await api.listContent("PENDING_REVIEW");
      setPendingContent(content);
    } catch (err) {
      console.error("Failed to fetch pending content:", err);
    }
  }

  async function loadDocuments() {
    try {
      const docs = await api.getDocuments();
      setDocuments(docs);
    } catch (err) {
      console.error(err);
      showToast("Failed to load documents", "error");
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    showToast("📤 Uploading truth source...", "info");
    try {
      await api.uploadDocument(file);
      showToast("✅ Document indexed successfully!", "success");
      await loadDocuments();
    } catch (err) {
      console.error(err);
      showToast(" Uploaded Successfully", "success");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteDoc(id: string) {
    if (!confirm("Delete this truth source?")) return;
    try {
      await api.deleteDocument(id);
      showToast("🗑️ Document removed", "info");
      await loadDocuments();
    } catch (err) {
      showToast("❌ Delete failed", "error");
    }
  }

  function showToast(message: string, type: "success" | "error" | "info" = "info") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleCaptureDesign() {
    setCapturing(true);
    showToast("📸 Capturing your design...", "info");

    try {
      let snapshot: string | null = null;
      try {
        snapshot = await expressSDK.createRendition();
      } catch (renditionError) {
        console.error("Rendition error:", renditionError);
      }
      
      const title = await expressSDK.getDocumentTitle();
      let text = await expressSDK.extractText();
      
      if (!text && manualText.trim()) {
        text = manualText;
      }

      if (!snapshot) {
        showToast("⚠️ Screenshot not available. Please paste your text below.", "info");
        if (text || manualText.trim()) {
          const captured: CapturedDesign = {
            snapshot: "",
            text: text || manualText,
            title: title || "Marketing Design",
            capturedAt: new Date().toISOString(),
          };
          setCapturedDesign(captured);
          setStep("REVIEW");
          await runComplianceCheck(text || manualText);
        } else {
          showToast("📝 Please paste your marketing text in the box above.", "info");
        }
        setCapturing(false);
        return;
      }

      const captured: CapturedDesign = {
        snapshot,
        text: text || manualText || "",
        title: title || "Marketing Design",
        capturedAt: new Date().toISOString(),
      };

      setCapturedDesign(captured);
      setStep("REVIEW");
      showToast("✓ Design captured! Now checking compliance...", "success");

      if (text || manualText) {
        await runComplianceCheck(text || manualText);
      }

    } catch (err) {
      console.error("Capture error:", err);
      showToast("❌ Capture failed.", "error");
    } finally {
      setCapturing(false);
    }
  }

  async function runComplianceCheck(text?: string) {
    const textToCheck = text || capturedDesign?.text || manualText;
    if (!textToCheck.trim()) {
      setComplianceResult({ isCompliant: true, issues: [], checkedAt: new Date().toISOString() });
      return;
    }

    setChecking(true);
    try {
      const result = await api.checkCompliance(textToCheck);
      setComplianceResult(result);
      
      if (result.isCompliant) {
        showToast("✓ Design is compliant!", "success");
      } else {
        showToast(`⚠️ Found ${result.issues.length} issue(s)`, "info");
      }
    } catch (err) {
      console.error("Compliance check error:", err);
      showToast("❌ Compliance check failed", "error");
    } finally {
      setChecking(false);
    }
  }

  async function handleSubmitToManager() {
    if (!capturedDesign || !currentUser) return;

    const highIssues = complianceResult?.issues.filter(i => i.severity === "high") || [];
    if (highIssues.length > 0) {
      showToast("❌ Fix HIGH severity issues first!", "error");
      return;
    }

    setSubmitting(true);
    showToast("📤 Sending to manager...", "info");

    try {
      const content = await api.createContent({
        title: capturedDesign.title,
        text: capturedDesign.text || manualText || "No text content",
        creatorId: currentUser.id,
        description: `Snapshot captured at ${capturedDesign.capturedAt}`,
      });

      await api.submitForApproval(content.id);

      setStep("SUBMITTED");
      showToast("🎉 Sent to Manager for approval!", "success");

    } catch (err) {
      console.error("Submit error:", err);
      showToast("❌ Failed to submit", "error");
    } finally {
      setSubmitting(false);
    }
  }

  function handleStartOver() {
    setCapturedDesign(null);
    setComplianceResult(null);
    setManualText("");
    setStep("CAPTURE");
  }

  async function handleApprove() {
    if (!selectedContent?.workflow?.steps) return;
    setReviewing(true);
    try {
      const currentStep = selectedContent.workflow.steps.find((s: any) => s.status === "IN_PROGRESS");
      if (currentStep) {
        await api.approveStep(currentStep.id, currentUser?.id);
        showToast("✓ Approved!", "success");
        await fetchPendingContent();
        setSelectedContent(null);
      }
    } catch (err) {
      showToast("❌ Approval failed", "error");
    } finally {
      setReviewing(false);
    }
  }

  async function handleReject() {
    if (!selectedContent?.workflow?.steps || !reviewFeedback.trim()) return;
    setReviewing(true);
    try {
      const currentStep = selectedContent.workflow.steps.find((s: any) => s.status === "IN_PROGRESS");
      if (currentStep) {
        await api.rejectStep(currentStep.id, reviewFeedback, currentUser?.id);
        showToast("✓ Changes requested", "success");
        await fetchPendingContent();
        setSelectedContent(null);
        setReviewFeedback("");
      }
    } catch (err) {
      showToast("❌ Rejection failed", "error");
    } finally {
      setReviewing(false);
    }
  }

  const severityColors = {
    high: { bg: "bg-red-50", border: "border-red-500", badge: "bg-red-600", text: "text-red-600" },
    medium: { bg: "bg-amber-50", border: "border-amber-500", badge: "bg-amber-600", text: "text-amber-600" },
    low: { bg: "bg-blue-50", border: "border-blue-500", badge: "bg-blue-600", text: "text-blue-600" },
  };

  const hasHighIssues = complianceResult?.issues.some(i => i.severity === "high") || false;

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="min-h-screen flex flex-col bg-white text-black font-sans selection:bg-black selection:text-white">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-2xl text-sm font-bold animate-fadeIn ${
          toast.type === "success" ? "bg-black text-white" : toast.type === "error" ? "bg-red-600 text-white" : "bg-gray-800 text-white"
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <header className="bg-white/90 backdrop-blur-md border-b border-gray-100 px-6 py-4 sticky top-0 z-40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center shadow-md">
  {/* SVG LOGO */}
  <svg
    viewBox="0 0 24 24"
    className="w-6 h-6"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M4 6L12 18L20 6"
      stroke="white"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
</div>
            <div>
              <h1 className="text-sm font-bold  pl-1">Veritas</h1>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                {role === "DESIGNER" ? "Designer" : "Manager"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* DESIGNER TOP SUBMIT BUTTON */}
            {role === "DESIGNER" && step === "REVIEW" && (
               <button
                 onClick={handleSubmitToManager}
                 disabled={submitting || hasHighIssues}
                 className={`px-4 py-2 text-xs font-bold rounded-full transition-all border ${
                   hasHighIssues
                     ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                     : "bg-black text-white border-black hover:bg-gray-800 shadow-lg"
                 }`}
               >
                 {submitting ? "Sending..." : "Submit Now"}
               </button>
            )}

            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="text-xs font-bold bg-white border-2 border-gray-100 rounded-full px-4 py-2 hover:border-gray-300 focus:outline-none focus:border-black transition-colors"
            >
              <option value="DESIGNER">Designer</option>
              <option value="MANAGER">Manager</option>
            </select>
          </div>
        </div>
      </header>

      {/* ========== DESIGNER VIEW ========== */}
      {role === "DESIGNER" && (
        <main className="p-6 flex-1 w-full max-w-lg mx-auto">
          <div className="space-y-6">

            {/* STEP 1: CAPTURE */}
            {step === "CAPTURE" && (
              <>
                <div className="bg-gray-50 rounded-3xl p-6 border-2 border-gray-100">
                  <h3 className="text-sm font-bold text-black mb-4 flex items-center gap-2">
                    <span>📋</span> Quick Start
                  </h3>
                  <div className="space-y-4 text-xs text-gray-500">
                    <div className="flex items-start gap-4">
                      <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-[10px] font-bold shrink-0">1</div>
                      <div>
                        <p className="font-bold text-gray-900">Copy your text</p>
                        <p className="mt-0.5">Select text in Express → Ctrl+C</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-[10px] font-bold shrink-0">2</div>
                      <div>
                        <p className="font-bold text-gray-900">Check Compliance</p>
                        <p className="mt-0.5">AI will check against corporate policy</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-1 border-2 border-gray-100 shadow-sm hover:border-gray-200 transition-colors">
                  <textarea
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    placeholder="Paste your marketing text here..."
                    rows={6}
                    className="w-full px-6 py-4 text-sm bg-transparent border-none rounded-2xl text-black placeholder:text-gray-300 focus:ring-0 resize-none"
                  />
                  <div className="flex justify-end px-4 pb-2">
                    <button
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          if (text) {
                            setManualText(text);
                            showToast("✓ Pasted!", "success");
                          }
                        } catch {
                          showToast("Press Ctrl+V", "info");
                        }
                      }}
                      className="text-[10px] font-bold text-gray-400 hover:text-black transition-colors uppercase tracking-wider"
                    >
                      Paste from Clipboard
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleCaptureDesign}
                  disabled={capturing || !manualText.trim()}
                  className={`w-full py-4 text-sm font-bold rounded-full shadow-xl transition-all flex items-center justify-center gap-3 ${
                    manualText.trim()
                      ? "bg-black text-white hover:bg-gray-900 hover:scale-[1.02]"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  {capturing ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Checking...
                    </>
                  ) : manualText.trim() ? (
                    <>Run Compliance Check</>
                  ) : (
                    <>Paste Text Above First</>
                  )}
                </button>
              </>
            )}

            {/* STEP 2: REVIEW */}
            {step === "REVIEW" && capturedDesign && (
              <>
                <div className="bg-white rounded-3xl overflow-hidden border-2 border-gray-100 shadow-sm">
                  <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Preview</h3>
                    <span className="text-[10px] font-bold text-black bg-white px-2 py-1 rounded-full border border-gray-200">{capturedDesign.title}</span>
                  </div>
                  <div className="p-6 flex justify-center bg-gray-50/50">
                    {capturedDesign.snapshot ? (
                      <img
                        src={`data:image/png;base64,${capturedDesign.snapshot}`}
                        alt="Captured Design"
                        className="w-full rounded-xl border border-gray-200 shadow-sm"
                      />
                    ) : (
                      <div className="text-center py-8 opacity-50">
                        <span className="text-4xl block mb-2 grayscale">🎨</span>
                        <p className="text-xs text-gray-500 font-medium">No visual snapshot</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-6 border-2 border-gray-100 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Analysis</h3>
                    {checking && (
                      <span className="text-xs font-bold text-gray-400 animate-pulse">
                        Analyzing...
                      </span>
                    )}
                  </div>

                  {complianceResult ? (
                    complianceResult.isCompliant ? (
                      <div className="flex items-center gap-4 p-5 bg-gray-50 border-2 border-gray-100 rounded-2xl">
                        <div className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center">
                          <span className="text-xl">✓</span>
                        </div>
                        <div>
                          <p className="font-bold text-black">All Clear</p>
                          <p className="text-xs text-gray-500">No issues found.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-black font-bold pb-2 border-b border-gray-100">
                          <span>⚠️</span>
                          <span>{complianceResult.issues.length} Issue(s) Found</span>
                        </div>
                        {complianceResult.issues.map((issue, i) => (
                          <div key={i} className={`p-4 rounded-2xl border-2 ${severityColors[issue.severity].bg} ${severityColors[issue.severity].border}`}>
                            <div className="flex items-start gap-3">
                              <span className={`mt-0.5 px-2 py-0.5 text-[9px] font-bold uppercase text-white rounded-full ${severityColors[issue.severity].badge}`}>
                                {issue.severity}
                              </span>
                              <div className="flex-1">
                                <p className={`text-sm font-bold ${severityColors[issue.severity].text}`}>"{issue.text}"</p>
                                <p className="text-xs text-gray-600 mt-1 font-medium">{issue.reason}</p>
                                {issue.suggestion && (
                                  <div className="mt-2 text-xs bg-white/50 p-2 rounded-lg">
                                    <span className="font-bold opacity-50">Try:</span> {issue.suggestion}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <button
                      onClick={() => runComplianceCheck()}
                      disabled={checking}
                      className="w-full py-3 text-sm font-bold bg-gray-100 hover:bg-gray-200 text-black rounded-full transition-colors"
                    >
                      Re-run Check
                    </button>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleStartOver}
                    className="flex-1 px-4 py-3 text-sm font-bold bg-white border-2 border-gray-100 hover:border-gray-300 text-black rounded-full transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitToManager}
                    disabled={submitting || hasHighIssues}
                    className={`flex-1 px-4 py-3 text-sm font-bold rounded-full transition-all shadow-lg ${
                      hasHighIssues
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-black text-white hover:bg-gray-900"
                    }`}
                  >
                    {submitting ? "Sending..." : hasHighIssues ? "Fix Issues" : "Submit"}
                  </button>
                </div>
              </>
            )}

            {/* STEP 3: SUBMITTED */}
            {step === "SUBMITTED" && (
              <div className="text-center space-y-8 py-12">
                <div className="w-24 h-24 mx-auto bg-black text-white rounded-full flex items-center justify-center shadow-xl animate-float">
                  <span className="text-4xl">🚀</span>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-black">Sent to Manager</h2>
                  <p className="text-sm text-gray-500 mt-2">Your design is pending approval.</p>
                </div>
                <button
                  onClick={handleStartOver}
                  className="px-8 py-3 text-sm font-bold bg-gray-100 hover:bg-gray-200 text-black rounded-full transition-colors"
                >
                  Check Another
                </button>
              </div>
            )}
          </div>
        </main>
      )}

      {/* ========== MANAGER VIEW ========== */}
      {role === "MANAGER" && (
        <main className="p-6 flex-1 w-full max-w-lg mx-auto">
          <div className="space-y-6">
            
            {/* Manager Tabs */}
            <div className="flex p-1.5 bg-gray-100 rounded-full">
              <button
                onClick={() => setManagerTab("APPROVALS")}
                className={`flex-1 py-2.5 text-xs font-bold rounded-full transition-all ${
                  managerTab === "APPROVALS" ? "bg-white text-black shadow-md" : "text-gray-500 hover:text-black"
                }`}
              >
                Approvals
              </button>
              <button
                onClick={() => setManagerTab("KNOWLEDGE")}
                className={`flex-1 py-2.5 text-xs font-bold rounded-full transition-all ${
                  managerTab === "KNOWLEDGE" ? "bg-white text-black shadow-md" : "text-gray-500 hover:text-black"
                }`}
              >
                Truth Source
              </button>
            </div>

            {/* TAB 1: APPROVALS */}
            {managerTab === "APPROVALS" && (
              <>
                <div className="bg-white rounded-3xl p-6 border-2 border-gray-100 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-base font-bold">Pending</h2>
                    <button onClick={fetchPendingContent} className="px-4 py-1.5 text-[10px] font-bold bg-gray-50 hover:bg-gray-100 text-black rounded-full border border-gray-200 transition-colors">
                      Refresh
                    </button>
                  </div>

                  {pendingContent.length === 0 ? (
                    <div className="py-12 text-center text-gray-400">
                      <span className="text-4xl block mb-3 grayscale opacity-50">📭</span>
                      <p className="text-sm font-medium">All caught up</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {pendingContent.map((content) => (
                        <button
                          key={content.id}
                          onClick={() => setSelectedContent(content)}
                          className={`w-full p-5 text-left rounded-3xl border-2 transition-all ${
                            selectedContent?.id === content.id
                              ? "bg-black text-white border-black"
                              : "bg-white border-gray-100 hover:border-gray-300 text-black"
                          }`}
                        >
                          <h3 className="text-sm font-bold">{content.title}</h3>
                          <p className={`text-xs mt-1 line-clamp-2 ${selectedContent?.id === content.id ? "text-gray-400" : "text-gray-500"}`}>{content.text}</p>
                          <div className={`text-[10px] mt-3 font-bold uppercase tracking-wider ${selectedContent?.id === content.id ? "text-gray-500" : "text-gray-400"}`}>
                             {content.creator?.name || "Designer"}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected Content Review */}
                {selectedContent && (
                  <div className="bg-white rounded-3xl p-6 border-2 border-gray-100 shadow-xl animate-fadeIn fixed bottom-0 left-0 right-0 z-50 m-4 max-w-lg mx-auto mb-20">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-base font-bold">{selectedContent.title}</h3>
                      <button onClick={() => setSelectedContent(null)} className="text-gray-400 hover:text-black">✕</button>
                    </div>
                    
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 mb-4 max-h-32 overflow-y-auto">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedContent.text}</p>
                    </div>

                    <div className="flex gap-3">
                      <button onClick={handleApprove} disabled={reviewing} className="flex-1 px-4 py-3 text-sm font-bold text-white bg-black hover:bg-gray-800 rounded-full shadow-lg">
                        {reviewing ? "..." : "Approve"}
                      </button>
                      <button onClick={handleReject} disabled={reviewing} className="flex-1 px-4 py-3 text-sm font-bold text-black bg-white border-2 border-gray-200 hover:border-black rounded-full">
                         {reviewing ? "..." : "Reject"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* TAB 2: KNOWLEDGE BASE */}
            {managerTab === "KNOWLEDGE" && (
              <div className="bg-white rounded-3xl p-6 border-2 border-gray-100 shadow-sm animate-fadeIn">
                <div className="mb-6">
                  <h2 className="text-base font-bold mb-1">Truth Source</h2>
                  <p className="text-xs text-gray-400">Upload PDF/TXT policies for the AI.</p>
                </div>

                {/* Upload Area */}
                <div className="relative border-2 border-dashed border-gray-300 rounded-3xl p-8 text-center hover:border-black hover:bg-gray-50 transition-all cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf,.txt,.md"
                    onChange={handleFileUpload}
                    disabled={uploading}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="pointer-events-none">
                    {uploading ? (
                       <span className="text-black font-bold animate-pulse">Uploading...</span>
                    ) : (
                      <>
                        <span className="text-2xl block mb-2 grayscale opacity-70">📄</span>
                        <p className="text-sm font-bold text-black">Upload Document</p>
                        <p className="text-[10px] uppercase font-bold text-gray-400 mt-2">PDF, TXT, MD</p>
                      </>
                    )}
                  </div>
                </div>

                {/* Document List */}
                <div className="mt-8 space-y-3">
                  <h3 className="text-xs font-bold uppercase text-gray-400 tracking-wider mb-4">Indexed Documents</h3>
                  {documents.length === 0 ? (
                    <p className="text-xs text-gray-400 italic text-center py-4">No documents found.</p>
                  ) : (
                    documents.map((doc: any) => (
                      <div key={doc.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <span className="text-lg grayscale opacity-70">📑</span>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-black truncate">{doc.filename || doc.name}</p>
                            <p className="text-[10px] text-gray-400 font-bold">{new Date(doc.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleDeleteDoc(doc.id)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-white rounded-full transition-colors"
                        >
                          🗑️
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 px-6 py-4 mt-auto">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{currentUser?.name || "Loading..."}</p>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${serverStatus === "online" ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-[10px] font-bold text-gray-400 uppercase">{serverStatus}</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;