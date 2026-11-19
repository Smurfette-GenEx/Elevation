"use client";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch, errorMessage } from "@/lib/client-api";

/** Fetches a short-lived signed URL for a private receipt and previews it. */
export function ReceiptViewer({ receiptId, onClose }: { receiptId: string | null; onClose: () => void }) {
  const [file, setFile] = useState<{ url: string; mimeType: string; fileName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setFile(null);
    setError(null);
    if (receiptId) apiFetch<{ url: string; mimeType: string; fileName: string }>(`/api/v1/receipts/${receiptId}/url`).then(setFile).catch((e) => setError(errorMessage(e)));
  }, [receiptId]);
  return (
    <Dialog open={!!receiptId} onClose={onClose} title={file?.fileName ?? "Receipt"} className="w-[min(900px,calc(100vw-2rem))]">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!file && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {file && (file.mimeType === "application/pdf"
        ? <iframe src={file.url} title={file.fileName} className="h-[70vh] w-full rounded border" />
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={file.url} alt={file.fileName} className="mx-auto max-h-[70vh] rounded border" />)}
      {file && <p className="mt-2 text-xs text-muted-foreground">Secure link valid for 5 minutes. <a className="text-primary hover:underline" href={file.url} target="_blank" rel="noreferrer">Open in new tab</a></p>}
    </Dialog>
  );
}
