import React, { useEffect } from "react";

interface ToastProps {
  message: string;
  type?: "info" | "error" | "success" | "warning";
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, type = "info", duration = 3000, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const bgColor = {
    info: "rgba(33, 150, 243, 0.9)",
    error: "rgba(244, 67, 54, 0.9)",
    success: "rgba(76, 175, 80, 0.9)",
    warning: "rgba(255, 152, 0, 0.9)",
  }[type];

  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        background: bgColor,
        color: "#fff",
        padding: "12px 20px",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        zIndex: 10000,
        maxWidth: "400px",
        wordBreak: "break-word",
        animation: "slideIn 0.3s ease-out",
      }}
    >
      {message}
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

