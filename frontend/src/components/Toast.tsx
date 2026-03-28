import { useEffect, useRef } from "react";

interface ToastProps {
  message: string;
  type?: "info" | "error" | "success" | "warning";
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, type = "info", duration = 5000, onClose }: ToastProps) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onCloseRef.current();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration]);

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
        overflow: "hidden",
      }}
    >
      <div style={{ position: "relative", zIndex: 1, paddingBottom: "4px" }}>{message}</div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          height: "4px",
          background: "rgba(255, 255, 255, 0.7)",
          animation: `toastProgress ${duration}ms linear forwards`
        }}
      />
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
        @keyframes toastProgress {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </div>
  );
}

