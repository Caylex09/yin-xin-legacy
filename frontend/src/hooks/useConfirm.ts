import { useState, useCallback } from "react";

interface ConfirmState {
  message: string;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "warning" | "info";
}

export function useConfirm() {
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const showConfirm = useCallback((
    message: string,
    onConfirm: () => void,
    options?: {
      confirmText?: string;
      cancelText?: string;
      type?: "danger" | "warning" | "info";
    }
  ) => {
    setConfirm({
      message,
      onConfirm: () => {
        onConfirm();
        setConfirm(null);
      },
      confirmText: options?.confirmText,
      cancelText: options?.cancelText,
      type: options?.type,
    });
  }, []);

  const hideConfirm = useCallback(() => {
    setConfirm(null);
  }, []);

  return { confirm, showConfirm, hideConfirm };
}

