"use client";

type Props = {
  tag: string; // full "namespace:name"
  active?: boolean; // for filter toggles
  onClick?: () => void;
  size?: "sm" | "md";
};

const NAMESPACE_COLORS: Record<string, string> = {
  type: "#6ab8f7",
  theme: "#7c6af7",
  emotion: "#f76ab8",
  character: "#f7a26a",
  plot: "#6af7b0",
  tone: "#f7e16a",
  trope: "#b06af7",
  relationship: "#6af7e1",
  claim: "#f76a6a",
  evidence: "#a2f76a",
  method: "#6a8df7",
  concept: "#f7c96a",
  discipline: "#8df76a",
  relation: "#f78d6a",
  strength: "#6af78d",
  question: "#c9f76a",
  mode: "#8888aa",
};

const DEFAULT_COLOR = "#8888aa";

export default function TagChip({ tag, active = false, onClick, size = "sm" }: Props) {
  const colonIdx = tag.indexOf(":");
  const namespace = colonIdx > 0 ? tag.slice(0, colonIdx) : tag;
  const name = colonIdx > 0 ? tag.slice(colonIdx + 1) : tag;
  const color = NAMESPACE_COLORS[namespace] ?? DEFAULT_COLOR;

  const interactive = typeof onClick === "function";
  const pad = size === "md" ? "3px 9px" : "2px 7px";
  const fontSize = size === "md" ? "12px" : "11px";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      title={tag}
      aria-pressed={interactive ? active : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: pad,
        fontSize,
        lineHeight: 1.2,
        borderRadius: "999px",
        border: `0.5px solid ${color}`,
        background: active ? color : `${color}26`, // 26 hex ≈ 15% opacity
        color: active ? "#0b0b0b" : color,
        cursor: interactive ? "pointer" : "default",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
        transition: "background 0.12s, color 0.12s",
      }}
    >
      {name}
    </button>
  );
}
