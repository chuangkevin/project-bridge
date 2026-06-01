import React from "react";

interface Props {
  rect: { x: number; y: number; width: number; height: number };
  iframeOffset: { x: number; y: number };
  onDragStart: (e: React.MouseEvent) => void;
  onResizeStart: (handle: string, e: React.MouseEvent) => void;
}

const HANDLE_SIZE = 8;
const HALF = HANDLE_SIZE / 2;

const HANDLES: { key: string; cursor: string; style: React.CSSProperties }[] = [
  // Corners
  { key: "nw", cursor: "nw-resize", style: { top: -HALF, left: -HALF } },
  { key: "ne", cursor: "ne-resize", style: { top: -HALF, right: -HALF } },
  { key: "sw", cursor: "sw-resize", style: { bottom: -HALF, left: -HALF } },
  { key: "se", cursor: "se-resize", style: { bottom: -HALF, right: -HALF } },
  // Edge midpoints
  { key: "n", cursor: "n-resize", style: { top: -HALF, left: "50%", marginLeft: -HALF } },
  { key: "s", cursor: "s-resize", style: { bottom: -HALF, left: "50%", marginLeft: -HALF } },
  { key: "w", cursor: "w-resize", style: { top: "50%", left: -HALF, marginTop: -HALF } },
  { key: "e", cursor: "e-resize", style: { top: "50%", right: -HALF, marginTop: -HALF } },
];

export default function SelectionOverlay({
  rect,
  iframeOffset,
  onDragStart,
  onResizeStart,
}: Props) {
  const left = rect.x + iframeOffset.x;
  const top = rect.y + iframeOffset.y;

  return (
    <div
      style={{
        position: "fixed",
        left,
        top,
        width: rect.width,
        height: rect.height,
        border: "2px solid #3b82f6",
        pointerEvents: "none",
        zIndex: 9999,
        boxSizing: "border-box",
      }}
    >
      {/* Drag handle – top-center bar */}
      <div
        onMouseDown={onDragStart}
        style={{
          position: "absolute",
          top: -20,
          left: "50%",
          transform: "translateX(-50%)",
          width: 40,
          height: 12,
          background: "#3b82f6",
          borderRadius: 4,
          cursor: "grab",
          pointerEvents: "auto",
        }}
      />

      {/* 8 resize handles */}
      {HANDLES.map(({ key, cursor, style }) => (
        <div
          key={key}
          onMouseDown={(e) => onResizeStart(key, e)}
          style={{
            position: "absolute",
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            background: "#3b82f6",
            border: "1px solid #ffffff",
            boxSizing: "border-box",
            cursor,
            pointerEvents: "auto",
            ...style,
          }}
        />
      ))}
    </div>
  );
}
