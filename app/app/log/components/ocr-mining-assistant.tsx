"use client";

import { useState } from "react";

type Props = {
  placeholder: string;
};

export function OcrMiningAssistant({ placeholder }: Props) {
  const [entryMode, setEntryMode] = useState<"manual" | "screenshot">("manual");
  const [entries, setEntries] = useState("");
  const [ocrStatus, setOcrStatus] = useState<string>("");
  const [ocrMeta, setOcrMeta] = useState("");

  const runOcr = async (file: File) => {
    setOcrStatus("Screenshot analyseren...");
    const fd = new FormData();
    fd.append("kind", "mining");
    fd.append("screenshot", file);
    const response = await fetch("/api/ocr/parse", { method: "POST", body: fd });
    const json = await response.json();
    if (!response.ok) {
      setOcrStatus(json.error || "OCR mislukt.");
      return;
    }
    const text = (json.entries || [])
      .map((entry: { resourceSlug: string; qty: number }) => `${entry.resourceSlug}:${entry.qty}`)
      .join("\n");
    setEntries(text);
    const confPct = Math.round((json.avgConfidence || 0) * 100);
    const status = `OCR klaar. Confidence: ${confPct}%`;
    setOcrStatus(status);
    setOcrMeta(status);
  };

  return (
    <>
      <div className="sc-card-strong rounded p-3 text-sm">
        <p className="mb-2 font-medium">Invoermodus</p>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="entryMode"
              value="manual"
              checked={entryMode === "manual"}
              onChange={() => setEntryMode("manual")}
            />
            Handmatig
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="entryMode"
              value="screenshot"
              checked={entryMode === "screenshot"}
              onChange={() => setEntryMode("screenshot")}
            />
            Via screenshot (OCR)
          </label>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium sc-muted">Entries</label>
        <textarea
          name="entries"
          rows={6}
          required
          className="sc-textarea px-3 py-2 font-mono text-sm"
          placeholder={placeholder}
          value={entries}
          onChange={(e) => setEntries(e.target.value)}
        />
      </div>

      <input type="hidden" name="ocrMeta" value={ocrMeta} />

      {entryMode === "screenshot" && ocrStatus ? (
        <p className="sc-muted text-xs">{ocrStatus}</p>
      ) : null}

      <div>
        <label className="mb-1 block text-sm font-medium sc-muted">Screenshots</label>
        <input
          name="screenshot"
          type="file"
          accept="image/*"
          className="sc-input px-3 py-2"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file && entryMode === "screenshot") {
              void runOcr(file);
            }
          }}
        />
        <p className="sc-muted mt-1 text-xs">
          In OCR modus wordt de screenshot geanalyseerd en kun je het resultaat nog aanpassen.
        </p>
      </div>
    </>
  );
}
