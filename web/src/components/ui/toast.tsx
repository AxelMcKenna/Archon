"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ToastVariant = "success" | "error" | "info";

export interface ToastOptions {
  /** Milliseconds before auto-dismiss. Defaults to 5000 (errors: 8000). Pass 0 to keep it sticky. */
  duration?: number;
}

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant, options?: ToastOptions) => void;
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 5000;
const ERROR_DURATION = 8000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "info", options?: ToastOptions) => {
      const id = (nextId.current += 1);
      const duration =
        options?.duration ?? (variant === "error" ? ERROR_DURATION : DEFAULT_DURATION);
      setToasts((current) => [...current, { id, message, variant, duration }]);
    },
    [],
  );

  const success = useCallback(
    (message: string, options?: ToastOptions) => toast(message, "success", options),
    [toast],
  );
  const error = useCallback(
    (message: string, options?: ToastOptions) => toast(message, "error", options),
    [toast],
  );
  const info = useCallback(
    (message: string, options?: ToastOptions) => toast(message, "info", options),
    [toast],
  );

  // Memoize so the context value is referentially stable — consumers that put
  // the toast helpers in effect/callback dependency arrays don't re-fire every
  // render. (All helpers are already useCallback-stable.)
  const value = useMemo<ToastContextValue>(
    () => ({ toast, success, error, info, dismiss }),
    [toast, success, error, info, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-ink-200 bg-white text-ink-900",
};

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (toast.duration <= 0) return;
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      role={toast.variant === "error" ? "alert" : "status"}
      className={`pointer-events-auto flex items-start gap-3 rounded-sm border px-3.5 py-3 text-sm shadow-lg shadow-ink-900/5 ${VARIANT_STYLES[toast.variant]}`}
    >
      <p className="flex-1 leading-snug">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 text-current/60 transition-opacity hover:opacity-100 opacity-70"
      >
        ✕
      </button>
    </div>
  );
}
