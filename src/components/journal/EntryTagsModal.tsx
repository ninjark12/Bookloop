"use client";

import { useEffect, useState } from "react";
import { X, Plus, Loader2 } from "lucide-react";
import { VALID_NAMESPACES } from "@/lib/search/parser";
import { useEntryTags, useAddEntryTag, useRemoveEntryTag } from "@/hooks/useEntryTags";
import TagChip from "@/components/search/TagChip";

type Props = {
  entryId: string;
  canEdit?: boolean;
  onClose: () => void;
};

export default function EntryTagsModal({ entryId, canEdit = true, onClose }: Props) {
  const { data, isLoading, isError } = useEntryTags(entryId);
  const addTag = useAddEntryTag(entryId);
  const removeTag = useRemoveEntryTag(entryId);

  const [namespace, setNamespace] = useState<string>(VALID_NAMESPACES[0]);
  const [value, setValue] = useState("");

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = value.trim().toLowerCase().replace(/\s+/g, "-");
    if (!name) return;
    addTag.mutate(`${namespace}:${name}`, { onSuccess: () => setValue("") });
  }

  const list = data?.tags ?? [];
  const analyzing = data?.processingStatus === "pending" || data?.processingStatus === "processing";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Entry tags"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 210,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--card)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--radius)",
          maxWidth: "440px",
          width: "100%",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1rem 1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "0.5px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground)" }}>Tags</span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "28px",
              height: "28px",
              border: "0.5px solid var(--border)",
              borderRadius: "var(--radius)",
              background: "var(--muted)",
              color: "var(--muted-foreground)",
              cursor: "pointer",
            }}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "1.25rem", overflowY: "auto" }}>
          {isLoading ? (
            <p style={{ fontSize: "13px", color: "var(--muted-foreground)", margin: 0 }}>Loading tags…</p>
          ) : isError ? (
            <p style={{ fontSize: "13px", color: "var(--destructive)", margin: 0 }}>
              Couldn&apos;t load tags.
            </p>
          ) : list.length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--muted-foreground)", margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
              {analyzing ? (
                <>
                  <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Analyzing…
                </>
              ) : (
                "No tags yet."
              )}
            </p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
              {list.map((t) => (
                <span key={t.tag} style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
                  <TagChip tag={t.tag} size="md" />
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={`Remove ${t.tag}`}
                      onClick={() => removeTag.mutate(t.tag)}
                      disabled={removeTag.isPending}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "16px",
                        height: "16px",
                        border: "none",
                        borderRadius: "999px",
                        background: "transparent",
                        color: "var(--muted-foreground)",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      <X size={11} aria-hidden="true" />
                    </button>
                  )}
                </span>
              ))}
              {analyzing && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "3px 9px",
                    fontSize: "11px",
                    borderRadius: "999px",
                    background: "var(--muted)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  <Loader2 size={11} className="animate-spin" aria-hidden="true" /> Analyzing…
                </span>
              )}
            </div>
          )}

          {/* Add form */}
          {canEdit && (
            <form
              onSubmit={handleAdd}
              style={{ display: "flex", gap: "6px", marginTop: "1rem", alignItems: "stretch" }}
            >
              <select
                aria-label="Tag namespace"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                style={{
                  padding: "6px 8px",
                  fontSize: "12px",
                  border: "0.5px solid var(--border)",
                  borderRadius: "var(--radius)",
                  background: "var(--background)",
                  color: "var(--foreground)",
                  fontFamily: "inherit",
                }}
              >
                {VALID_NAMESPACES.map((ns) => (
                  <option key={ns} value={ns}>
                    {ns}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="value (e.g. betrayal)"
                aria-label="Tag value"
                maxLength={60}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "6px 8px",
                  fontSize: "13px",
                  border: "0.5px solid var(--border)",
                  borderRadius: "var(--radius)",
                  background: "var(--background)",
                  color: "var(--foreground)",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
              <button
                type="submit"
                disabled={!value.trim() || addTag.isPending}
                aria-label="Add tag"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "6px 12px",
                  fontSize: "12px",
                  border: "none",
                  borderRadius: "var(--radius)",
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                  cursor: !value.trim() || addTag.isPending ? "not-allowed" : "pointer",
                  opacity: !value.trim() || addTag.isPending ? 0.6 : 1,
                }}
              >
                <Plus size={12} aria-hidden="true" /> Add
              </button>
            </form>
          )}

          {addTag.isError && (
            <p role="alert" style={{ fontSize: "12px", color: "var(--destructive)", margin: "8px 0 0" }}>
              {addTag.error instanceof Error ? addTag.error.message : "Failed to add tag"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
