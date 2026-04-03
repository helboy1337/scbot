"use client";

import { useState } from "react";

type Props = {
  inputPlaceholder: string;
  outputPlaceholder: string;
};

export function OcrRefineryAssistant({ inputPlaceholder, outputPlaceholder }: Props) {
  const [entryMode, setEntryMode] = useState<"manual" | "screenshot">("manual");
  const [inputEntries, setInputEntries] = useState("");
  const [outputEntries, setOutputEntries] = useState("");
  const [ocrStatus, setOcrStatus] = useState("");
  const [ocrMeta, setOcrMeta] = useState("");

  const runOcr = async (file: File) => {
    setOcrStatus("Refinery screenshot analyseren...");
    const fd = new FormData();
    fd.append("kind", "refinery");
    fd.append("screenshot", file);
    const response = await fetch("/api/ocr/parse", { method: "POST", body: fd });
    const json = await response.json();
    if (!response.ok) {
      setOcrStatus(json.error || "OCR mislukt.");
      return;
    }
    const inText = (json.inputs || [])
      .map((entry: { resourceSlug: string; qty: number }) => `${entry.resourceSlug}:${entry.qty}`)
      .join("\n");
    const outText = (json.outputs || [])
      .map((entry: { resourceSlug: string; qty: number }) => `${entry.resourceSlug}:${entry.qty}`)
      .join("\n");
    setInputEntries(inText);
    setOutputEntries(outText);
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

      <input type="hidden" name="ocrMeta" value={ocrMeta} />

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium sc-muted">Input entries</label>
          <textarea
            name="inputEntries"
            rows={5}
            required
            className="sc-textarea px-3 py-2 font-mono text-sm"
            placeholder={inputPlaceholder}
            value={inputEntries}
            onChange={(e) => setInputEntries(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium sc-muted">Output entries</label>
          <textarea
            name="outputEntries"
            rows={5}
            required
            className="sc-textarea px-3 py-2 font-mono text-sm"
            placeholder={outputPlaceholder}
            value={outputEntries}
            onChange={(e) => setOutputEntries(e.target.value)}
          />
        </div>
      </div>

      {entryMode === "screenshot" && ocrStatus ? <p className="sc-muted text-xs">{ocrStatus}</p> : null}

      <div>
        <label className="mb-1 block text-sm font-medium sc-muted">Screenshot</label>
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
      </div>
    </>
  );
}
