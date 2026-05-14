"use client";

import { AiThinking } from "@/components/ai-thinking";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderCoveringLetterHtml(md: string): string {
  const blocks = md.split(/\n{2,}/);
  return blocks
    .map((blk) => {
      const t = blk.trim();
      if (!t) return "";
      if (t.startsWith("### ")) {
        return `<h3>${escapeHtml(t.slice(4))}</h3>`;
      }
      if (t.startsWith("> ")) {
        return `<blockquote>${escapeHtml(t.slice(2))}</blockquote>`;
      }
      const inline = escapeHtml(t)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/  \n/g, "<br>")
        .replace(/\n/g, "<br>");
      return `<p>${inline}</p>`;
    })
    .filter(Boolean)
    .join("\n");
}

function openPrintWindow(markdown: string) {
  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
  if (!w) return;
  const body = renderCoveringLetterHtml(markdown);
  w.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>Covering letter</title>
<style>
  @page { size: A4; margin: 22mm 20mm; }
  body {
    font: 11pt/1.55 "Helvetica Neue", Arial, sans-serif;
    color: #1d2730; max-width: 760px; margin: 0 auto; padding: 24px;
  }
  h3 {
    font-size: 11.5pt; margin: 18px 0 6px 0;
    color: #00595f; letter-spacing: 0.2px;
    border-bottom: 1px solid #e2e7ea; padding-bottom: 4px;
  }
  p { margin: 6px 0; }
  blockquote {
    margin: 8px 0; padding: 6px 12px;
    background: #fff8e1; border-left: 3px solid #f1c14b;
    font-size: 10pt; color: #5a4a10;
  }
  strong { color: #1d2730; }
  code {
    font: 10pt/1.4 "SF Mono", Menlo, monospace;
    background: #f6f8f9; padding: 1px 4px; border-radius: 2px;
  }
  .hint { font-size: 10pt; color: #5a6770; margin-top: 18px; }
  @media print { .hint { display: none; } }
</style></head>
<body>
${body}
<p class="hint">Use your browser's <em>Print → Save as PDF</em> to save this letter.</p>
<script>setTimeout(() => window.print(), 200);</script>
</body></html>`);
  w.document.close();
}

export function CoveringLetterModal({
  loading,
  text,
  copied,
  onCopy,
  onClose,
}: {
  loading: boolean;
  text: string | null;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-raised rounded-sm shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-ink-700/10">
          <div>
            <h3 className="font-semibold">Covering letter</h3>
            <p className="text-xs text-ink-500 mt-0.5">
              Generated from matched plan evidence. Edit before sending.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCopy}
              disabled={!text}
              className="rounded-sm border border-ink-700/20 bg-surface-raised text-ink-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50 cursor-pointer hover:bg-ink-700/5"
            >
              {copied ? "Copied" : "Copy markdown"}
            </button>
            <button
              onClick={() => text && openPrintWindow(text)}
              disabled={!text}
              className="rounded-sm border border-ink-700/20 bg-surface-raised text-ink-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50 cursor-pointer hover:bg-ink-700/5"
            >
              Print → PDF
            </button>
            <button
              onClick={onClose}
              className="rounded-sm border border-ink-700/20 bg-surface-raised text-ink-900 px-3 py-1.5 text-sm font-medium cursor-pointer hover:bg-ink-700/5"
            >
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading || !text ? (
            <AiThinking
              label="Composing covering letter"
              hint="Stitching item drafts and plan evidence into a single submission letter."
              variant="block"
            />
          ) : (
            <div
              className="prose prose-sm max-w-none [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-5 [&_h3]:mb-1 [&_h3]:text-emerald-900 [&_p]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-amber-400 [&_blockquote]:bg-amber-50 [&_blockquote]:px-3 [&_blockquote]:py-2 [&_blockquote]:my-2 [&_blockquote]:text-sm [&_code]:bg-ink-700/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded-sm [&_code]:text-xs"
              dangerouslySetInnerHTML={{ __html: renderCoveringLetterHtml(text) }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
