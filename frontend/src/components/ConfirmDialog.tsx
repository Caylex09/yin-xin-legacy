import React from "react";

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "warning" | "info";
}

export function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  confirmText = "确定",
  cancelText = "取消",
  type = "info",
}: ConfirmDialogProps) {
  const confirmBgColor = {
    danger: "#f44336",
    warning: "#ff9800",
    info: "#2196f3",
  }[type];

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10001,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          maxWidth: "400px",
          width: "90%",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
          wordBreak: "break-word",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ marginBottom: 20, fontSize: 16, lineHeight: 1.5, color: "#2c1a0d" }}>
          {message}
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button
            className="btn ghost"
            onClick={onCancel}
            style={{ fontSize: "14px" }}
          >
            {cancelText}
          </button>
          <button
            className="btn"
            onClick={onConfirm}
            style={{ fontSize: "14px", background: confirmBgColor }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

