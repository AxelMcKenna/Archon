"use client";

import { useEffect } from "react";

// global-error replaces the root layout when an error is thrown in the layout
// itself, so it must render its own <html>/<body>. Keep it dependency-free and
// inline-styled — the surrounding app chrome (and Tailwind) may not be mounted.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en-NZ">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          background: "#fafaf9",
          color: "#1c1917",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
          The app hit an unexpected error
        </h1>
        <p style={{ marginTop: "0.5rem", color: "#78716c", fontSize: "0.875rem", maxWidth: "28rem" }}>
          The error has been logged. Please try again.
          {error.digest ? (
            <span style={{ display: "block", marginTop: "0.5rem", fontSize: "0.75rem", color: "#a8a29e" }}>
              Ref: {error.digest}
            </span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "1.5rem",
            border: "none",
            borderRadius: "2px",
            background: "#1c1917",
            color: "#fff",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
