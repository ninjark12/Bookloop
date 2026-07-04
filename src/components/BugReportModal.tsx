"use client";

import { useState, useEffect, useRef } from "react";
import { X, Bug, Lightbulb } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export default function BugReportModal({ onClose }: { onClose: () => void }) {
  const { data: session } = authClient.useSession();
  const [type, setType] = useState<"bug" | "feature">("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/bug-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: title.trim(),
          description: description.trim(),
          reporterEmail: session?.user.email,
          reporterName: session?.user.name,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to send");
      }
      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Report a bug"
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1.5rem",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--card)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--radius)",
        maxWidth: "460px", width: "100%",
        display: "flex", flexDirection: "column",
        boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "1rem 1.25rem",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "0.5px solid var(--border)",
          flexShrink: 0,
        }}>
          <div role="group" aria-label="Report type" style={{ display: "flex", gap: "4px" }}>
            {([
              { value: "bug", label: "Bug", Icon: Bug },
              { value: "feature", label: "Feature request", Icon: Lightbulb },
            ] as const).map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={type === value}
                onClick={() => { setType(value); setTitle(""); setDescription(""); setError(""); }}
                style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  padding: "4px 10px", fontSize: "12px",
                  border: "0.5px solid var(--border)", borderRadius: "4px",
                  background: type === value ? "var(--primary)" : "var(--muted)",
                  color: type === value ? "var(--primary-foreground)" : "var(--muted-foreground)",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                <Icon size={12} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: "28px", height: "28px",
              border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
              background: "var(--muted)", color: "var(--muted-foreground)", cursor: "pointer",
            }}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "1.25rem" }}>
          {submitted ? (
            <div style={{ textAlign: "center", padding: "1rem 0" }}>
              <p style={{ fontSize: "14px", color: "var(--foreground)", margin: "0 0 6px" }}>
                Thanks for the report!
              </p>
              <p style={{ fontSize: "12px", color: "var(--muted-foreground)", margin: 0 }}>
                We&apos;ll look into it shortly.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <label htmlFor="report-title" style={{ fontSize: "10px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {type === "bug" ? "What went wrong?" : "What would you like?"}
                </label>
                <input
                  ref={titleRef}
                  id="report-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={type === "bug" ? "Brief summary" : "Feature title"}
                  maxLength={120}
                  style={{
                    padding: "6px 8px", fontSize: "13px",
                    border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
                    background: "var(--background)", color: "var(--foreground)", outline: "none",
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <label htmlFor="report-description" style={{ fontSize: "10px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {type === "bug" ? "Steps to reproduce" : "Describe the feature"}
                </label>
                <textarea
                  id="report-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={type === "bug" ? "What were you doing when it happened?" : "How would this work, and why would it be useful?"}
                  rows={4}
                  style={{
                    padding: "6px 8px", fontSize: "13px",
                    border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
                    background: "var(--background)", color: "var(--foreground)",
                    outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.6,
                  }}
                />
              </div>

              {error && (
                <p role="alert" style={{ fontSize: "12px", color: "var(--destructive)", margin: 0 }}>
                  {error}
                </p>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "6px 14px", fontSize: "12px",
                    border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
                    background: "var(--muted)", color: "var(--muted-foreground)", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: "4px",
                  }}
                >
                  <X size={12} aria-hidden="true" /> Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !title.trim() || !description.trim()}
                  style={{
                    padding: "6px 14px", fontSize: "12px",
                    border: "none", borderRadius: "var(--radius)",
                    background: "var(--primary)", color: "var(--primary-foreground)",
                    cursor: submitting || !title.trim() || !description.trim() ? "not-allowed" : "pointer",
                    opacity: submitting || !title.trim() || !description.trim() ? 0.6 : 1,
                  }}
                >
                  {submitting ? "Sending..." : "Send report"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
