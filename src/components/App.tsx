
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
    // Try clipboard first
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) return text;
    } catch {}

    // Try SDK methods
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

  function showToast(message: string, type: "success" | "error" | "info" = "info") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  // ============================================
  // DESIGNER: CAPTURE DESIGN
  // ============================================
  async function handleCaptureDesign() {
    setCapturing(true);
    showToast("📸 Capturing your design...", "info");

    try {
      // Get screenshot
      let snapshot: string | null = null;
      
      try {
        snapshot = await expressSDK.createRendition();
        console.log("Rendition result:", snapshot ? "success" : "null");
      } catch (renditionError) {
        console.error("Rendition error:", renditionError);
      }
      
      // Get title
      const title = await expressSDK.getDocumentTitle();
      
      // Get text (from clipboard or selection)
      let text = await expressSDK.extractText();
      
      // If no text found, use manual input
      if (!text && manualText.trim()) {
        text = manualText;
      }

      // If no snapshot, show specific guidance
      if (!snapshot) {
        showToast("⚠️ Screenshot not available. Please paste your text below and continue.", "info");
        
        // Still proceed if we have text - just without screenshot
        if (text || manualText.trim()) {
          const captured: CapturedDesign = {
            snapshot: "", // Empty - will show placeholder
            text: text || manualText,
            title: title || "Marketing Design",
            capturedAt: new Date().toISOString(),
          };
          setCapturedDesign(captured);
          setStep("REVIEW");
          
          // Auto-check compliance
          await runComplianceCheck(text || manualText);
        } else {
          showToast("📝 Please paste your marketing text in the box above, then click Capture again.", "info");
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

      // Auto-check compliance if there's text
      if (text || manualText) {
        await runComplianceCheck(text || manualText);
      }

    } catch (err) {
      console.error("Capture error:", err);
      showToast("❌ Capture failed. Try pasting text manually.", "error");
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
        showToast(`⚠️ Found ${result.issues.length} issue(s) to review`, "info");
      }
    } catch (err) {
      console.error("Compliance check error:", err);
      showToast("❌ Compliance check failed", "error");
    } finally {
      setChecking(false);
    }
  }

  // ============================================
  // DESIGNER: SUBMIT TO MANAGER
  // ============================================
  async function handleSubmitToManager() {
    if (!capturedDesign || !currentUser) return;

    // Block if HIGH severity issues
    const highIssues = complianceResult?.issues.filter(i => i.severity === "high") || [];
    if (highIssues.length > 0) {
      showToast("❌ Fix HIGH severity issues first!", "error");
      return;
    }

    setSubmitting(true);
    showToast("📤 Sending to manager...", "info");

    try {
      // Create content
      const content = await api.createContent({
        title: capturedDesign.title,
        text: capturedDesign.text || manualText || "No text content",
        creatorId: currentUser.id,
        description: `Snapshot captured at ${capturedDesign.capturedAt}`,
      });

      // Submit for approval
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

  // ============================================
  // MANAGER FUNCTIONS
  // ============================================
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

  // ============================================
  // RENDER HELPERS
  // ============================================
  const severityColors = {
    high: { bg: "bg-red-500/20", border: "border-red-500", badge: "bg-red-600", text: "text-red-400" },
    medium: { bg: "bg-amber-500/20", border: "border-amber-500", badge: "bg-amber-600", text: "text-amber-400" },
    low: { bg: "bg-blue-500/20", border: "border-blue-500", badge: "bg-blue-600", text: "text-blue-400" },
  };

  const hasHighIssues = complianceResult?.issues.some(i => i.severity === "high") || false;

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold animate-fadeIn ${
          toast.type === "success" ? "bg-emerald-500" : toast.type === "error" ? "bg-red-500" : "bg-slate-700"
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700 px-4 py-3 sticky top-0 z-40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
              <span className="text-xl">🧠</span>
            </div>
            <div>
              <h1 className="text-base font-bold">Corporate Brain</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">
                {role === "DESIGNER" ? "Design Compliance" : "Approval Queue"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="text-xs font-semibold bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
            >
              <option value="DESIGNER">👤 Designer</option>
              <option value="MANAGER">👔 Manager</option>
            </select>
            <div className={`w-2.5 h-2.5 rounded-full ${serverStatus === "online" ? "bg-emerald-400" : "bg-red-400"}`} />
          </div>
        </div>
      </header>

      {/* ========== DESIGNER VIEW ========== */}
      {role === "DESIGNER" && (
        <main className="p-4">
          <div className="max-w-md mx-auto space-y-4">

            {/* STEP 1: CAPTURE */}
            {step === "CAPTURE" && (
              <>
                {/* Instructions */}
                <div className="bg-gradient-to-r from-violet-600/20 to-purple-600/20 border border-violet-500/30 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-violet-300 mb-3 flex items-center gap-2">
                    <span>📋</span> Quick Start
                  </h3>
                  <div className="space-y-3 text-xs text-slate-300">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center text-[10px] font-bold shrink-0">1</div>
                      <div>
                        <p className="font-semibold text-white">Your design is ready ✓</p>
                        <p className="text-slate-400">We can see you have a template open</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold shrink-0">2</div>
                      <div>
                        <p className="font-semibold text-amber-300">⚠️ IMPORTANT: Copy your text first!</p>
                        <p className="text-slate-400">Click on text in Express → Select all → <kbd className="px-1 py-0.5 bg-slate-700 rounded text-[10px]">Ctrl+C</kbd></p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center text-[10px] font-bold shrink-0">3</div>
                      <div>
                        <p className="font-semibold text-white">Click "Check Compliance" below</p>
                        <p className="text-slate-400">AI will analyze your marketing text</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Text Input - REQUIRED */}
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Marketing Text to Check
                    </label>
                    <button
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          if (text) {
                            setManualText(text);
                            showToast("✓ Pasted from clipboard!", "success");
                          }
                        } catch {
                          showToast("Press Ctrl+V to paste", "info");
                        }
                      }}
                      className="text-[10px] text-violet-400 hover:text-violet-300 font-semibold"
                    >
                      📋 Paste
                    </button>
                  </div>
                  <textarea
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    placeholder="Paste your marketing text here...

Example from your design:
'ABC TUTORIALS - MOCK TESTS FOR FINAL EXAMS - THE BEST WAY TO PREPARE - SIGN UP NOW'"
                    rows={5}
                    className="w-full px-4 py-3 text-sm bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder:text-slate-500 focus:ring-2 focus:ring-violet-500 resize-none"
                  />
                  {!manualText.trim() && (
                    <p className="text-[10px] text-amber-400 mt-2">
                      ⚠️ Please paste your text above to check compliance
                    </p>
                  )}
                </div>

                {/* Capture Button */}
                <button
                  onClick={handleCaptureDesign}
                  disabled={capturing || !manualText.trim()}
                  className={`w-full px-6 py-4 text-base font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-3 ${
                    manualText.trim()
                      ? "bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 shadow-violet-500/30"
                      : "bg-slate-700 text-slate-400 cursor-not-allowed"
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
                    <>🔍 Check Compliance</>
                  ) : (
                    <>📝 Paste Text Above First</>
                  )}
                </button>
              </>
            )}

            {/* STEP 2: REVIEW */}
            {step === "REVIEW" && capturedDesign && (
              <>
                {/* Design Preview */}
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl overflow-hidden border border-slate-700">
                  <div className="p-3 bg-slate-700/50 border-b border-slate-600 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Your Design</h3>
                    <span className="text-[10px] text-slate-500">{capturedDesign.title}</span>
                  </div>
                  <div className="p-4">
                    {capturedDesign.snapshot ? (
                      <img
                        src={`data:image/png;base64,${capturedDesign.snapshot}`}
                        alt="Captured Design"
                        className="w-full rounded-lg border border-slate-600"
                      />
                    ) : (
                      <div className="w-full h-40 bg-slate-700/50 rounded-lg border border-slate-600 flex items-center justify-center">
                        <div className="text-center">
                          <span className="text-4xl block mb-2">🎨</span>
                          <p className="text-xs text-slate-400">Screenshot not available</p>
                          <p className="text-[10px] text-slate-500">Text content captured below</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Text Content */}
                {(capturedDesign.text || manualText) && (
                  <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Text Content</h3>
                    <p className="text-sm text-slate-300 italic">"{capturedDesign.text || manualText}"</p>
                  </div>
                )}

                {/* Compliance Results */}
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">AI Compliance Check</h3>
                    {checking && (
                      <span className="flex items-center gap-1.5 text-xs text-violet-400">
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Checking...
                      </span>
                    )}
                  </div>

                  {complianceResult ? (
                    complianceResult.isCompliant ? (
                      <div className="flex items-center gap-4 p-4 bg-emerald-500/20 border border-emerald-500/50 rounded-xl">
                        <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center">
                          <span className="text-2xl">✓</span>
                        </div>
                        <div>
                          <p className="font-bold text-emerald-400">All Clear!</p>
                          <p className="text-xs text-emerald-400/70">No compliance issues found</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-red-400">
                          <span>⚠️</span>
                          <span className="font-bold">{complianceResult.issues.length} Issue(s) Found</span>
                        </div>
                        {complianceResult.issues.map((issue, i) => (
                          <div key={i} className={`p-3 rounded-lg border ${severityColors[issue.severity].bg} ${severityColors[issue.severity].border}`}>
                            <div className="flex items-start gap-2">
                              <span className={`px-2 py-0.5 text-[9px] font-bold uppercase text-white rounded ${severityColors[issue.severity].badge}`}>
                                {issue.severity}
                              </span>
                              <div className="flex-1">
                                <p className={`text-sm font-semibold ${severityColors[issue.severity].text}`}>"{issue.text}"</p>
                                <p className="text-xs text-slate-400 mt-1">{issue.reason}</p>
                                {issue.suggestion && (
                                  <p className="text-xs text-emerald-400 mt-1">→ {issue.suggestion}</p>
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
                      className="w-full px-4 py-3 text-sm font-semibold bg-slate-700 hover:bg-slate-600 rounded-lg"
                    >
                      🔍 Run Compliance Check
                    </button>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={handleStartOver}
                    className="flex-1 px-4 py-3 text-sm font-semibold bg-slate-700 hover:bg-slate-600 rounded-xl"
                  >
                    ← Recapture
                  </button>
                  <button
                    onClick={handleSubmitToManager}
                    disabled={submitting || hasHighIssues}
                    className={`flex-1 px-4 py-3 text-sm font-bold rounded-xl transition-all ${
                      hasHighIssues
                        ? "bg-slate-600 text-slate-400 cursor-not-allowed"
                        : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500"
                    }`}
                  >
                    {submitting ? "Sending..." : hasHighIssues ? "Fix Issues First" : "Send to Manager →"}
                  </button>
                </div>

                {hasHighIssues && (
                  <p className="text-xs text-red-400 text-center">
                    Fix HIGH severity issues in your design, then recapture.
                  </p>
                )}
              </>
            )}

            {/* STEP 3: SUBMITTED */}
            {step === "SUBMITTED" && (
              <div className="text-center space-y-6 py-8">
                <div className="w-20 h-20 mx-auto bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full flex items-center justify-center animate-float">
                  <span className="text-4xl">🚀</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold">Sent to Manager!</h2>
                  <p className="text-sm text-slate-400 mt-2">Your design is now pending approval.</p>
                </div>
                <button
                  onClick={handleStartOver}
                  className="px-6 py-3 text-sm font-semibold bg-violet-600 hover:bg-violet-500 rounded-xl"
                >
                  Submit Another Design
                </button>
              </div>
            )}
          </div>
        </main>
      )}

      {/* ========== MANAGER VIEW ========== */}
      {role === "MANAGER" && (
        <main className="p-4">
          <div className="max-w-md mx-auto space-y-4">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold">Pending Approvals</h2>
                <button
                  onClick={fetchPendingContent}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-700 hover:bg-slate-600 rounded-lg"
                >
                  🔄 Refresh
                </button>
              </div>

              {pendingContent.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <span className="text-4xl block mb-2">📭</span>
                  <p className="text-sm">No pending approvals</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingContent.map((content) => (
                    <button
                      key={content.id}
                      onClick={() => setSelectedContent(content)}
                      className={`w-full p-4 text-left rounded-xl border transition-all ${
                        selectedContent?.id === content.id
                          ? "bg-violet-600/20 border-violet-500"
                          : "bg-slate-700/50 border-slate-600 hover:bg-slate-700"
                      }`}
                    >
                      <h3 className="text-sm font-bold">{content.title}</h3>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">{content.text}</p>
                      <p className="text-[10px] text-slate-500 mt-2">From: {content.creator?.name || "Designer"}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Content Review */}
            {selectedContent && (
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700 animate-fadeIn">
                <h3 className="text-base font-bold mb-3">{selectedContent.title}</h3>
                
                <div className="p-4 bg-slate-700/50 rounded-lg border border-slate-600 mb-4">
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{selectedContent.text}</p>
                </div>

                {/* Compliance Report */}
                {selectedContent.complianceResult && (
                  <div className="p-3 bg-slate-700/30 rounded-lg mb-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">AI Compliance Report</h4>
                    {selectedContent.complianceResult.isCompliant ? (
                      <p className="text-sm text-emerald-400">✓ Passed all checks</p>
                    ) : (
                      <p className="text-sm text-amber-400">
                        ⚠️ {selectedContent.complianceResult.issues?.length || 0} issue(s) flagged
                      </p>
                    )}
                  </div>
                )}

                <textarea
                  value={reviewFeedback}
                  onChange={(e) => setReviewFeedback(e.target.value)}
                  placeholder="Feedback for designer (required for rejection)..."
                  rows={3}
                  className="w-full px-4 py-3 text-sm bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder:text-slate-500 focus:ring-2 focus:ring-violet-500 mb-4 resize-none"
                />

                <div className="flex gap-3">
                  <button
                    onClick={handleApprove}
                    disabled={reviewing}
                    className="flex-1 px-4 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl disabled:opacity-50"
                  >
                    {reviewing ? "..." : "✓ Approve"}
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={reviewing || !reviewFeedback.trim()}
                    className="flex-1 px-4 py-3 text-sm font-bold text-white bg-red-600 hover:bg-red-500 rounded-xl disabled:opacity-50"
                  >
                    {reviewing ? "..." : "✗ Request Changes"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      )}

      {/* Footer */}
      <footer className="bg-slate-800/30 border-t border-slate-700 px-4 py-2 mt-auto">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <p className="text-[10px] text-slate-500">{currentUser?.name || "Loading..."}</p>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${serverStatus === "online" ? "bg-emerald-400" : "bg-red-400"}`} />
            <span className="text-[10px] text-slate-500">{serverStatus}</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
