import { config } from "../config";
import { parseReceiptText, type ExtractedReceipt } from "../domain/receipt-parser";

/**
 * OCR is a port: core logic depends only on this interface, so providers
 * (Azure Document Intelligence, AWS Textract, Google Document AI, Mindee, Tesseract…)
 * can be swapped through configuration without touching business code.
 */
export interface OcrProvider {
  readonly name: string;
  extract(file: Buffer, mimeType: string, fileName: string): Promise<ExtractedReceipt>;
}

/** Development provider: deterministic extraction from the file name or embedded text. */
export class MockOcrProvider implements OcrProvider {
  readonly name = "mock";
  async extract(file: Buffer, mimeType: string, fileName: string): Promise<ExtractedReceipt> {
    // Use text found in simple (uncompressed) PDFs, otherwise the file name, e.g. "Ibis_2026-03-12_245.50_EUR.pdf"
    const text = mimeType === "application/pdf" ? extractPdfText(file) : "";
    const fromName = fileName.replace(/\.[a-z]+$/i, "").replace(/[_]+/g, "\n");
    const parsed = parseReceiptText(text || fromName);
    if (!parsed.total) {
      const amount = fileName.match(/(\d+[.,]\d{2})/)?.[1];
      if (amount) parsed.total = amount.replace(",", ".");
    }
    return parsed;
  }
}

function extractPdfText(buf: Buffer): string {
  const raw = buf.toString("latin1");
  return [...raw.matchAll(/\(([^)]{1,200})\)\s*Tj/g)].map((m) => m[1]).join("\n");
}

/** Azure AI Document Intelligence — prebuilt receipt model (REST, async operation). */
export class AzureDocumentIntelligenceProvider implements OcrProvider {
  readonly name = "azure-document-intelligence";
  constructor(private endpoint: string, private key: string) {}
  async extract(file: Buffer, mimeType: string): Promise<ExtractedReceipt> {
    const url = `${this.endpoint.replace(/\/$/, "")}/documentintelligence/documentModels/prebuilt-receipt:analyze?api-version=2024-11-30`;
    const start = await fetch(url, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": this.key, "Content-Type": mimeType }, body: new Uint8Array(file) });
    if (start.status !== 202) throw new Error(`OCR request failed (${start.status})`);
    const op = start.headers.get("operation-location")!;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const res = await fetch(op, { headers: { "Ocp-Apim-Subscription-Key": this.key } });
      type Money = { amount?: number; currencyCode?: string };
      type Fields = { MerchantName?: { valueString?: string }; TransactionDate?: { valueDate?: string }; Total?: { valueCurrency?: Money }; TotalTax?: { valueCurrency?: Money } };
      const body = (await res.json()) as { status: string; analyzeResult?: { documents?: { fields?: Fields; confidence?: number }[] } };
      if (body.status === "succeeded") {
        const f: Fields = body.analyzeResult?.documents?.[0]?.fields ?? {};
        const total = f.Total?.valueCurrency;
        const result = {
          merchant: f.MerchantName?.valueString ?? null,
          date: f.TransactionDate?.valueDate ?? null,
          total: total?.amount != null ? Number(total.amount).toFixed(2) : null,
          tax: f.TotalTax?.valueCurrency?.amount != null ? Number(f.TotalTax.valueCurrency.amount).toFixed(2) : null,
          currency: total?.currencyCode ?? null,
        };
        return { ...result, confidence: body.analyzeResult?.documents?.[0]?.confidence ?? 0.5 };
      }
      if (body.status === "failed") throw new Error("OCR analysis failed");
    }
    throw new Error("OCR analysis timed out");
  }
}

export function ocrProvider(): OcrProvider | null {
  const c = config();
  if (c.OCR_PROVIDER === "azure" && c.AZURE_DI_ENDPOINT && c.AZURE_DI_KEY) return new AzureDocumentIntelligenceProvider(c.AZURE_DI_ENDPOINT, c.AZURE_DI_KEY);
  if (c.OCR_PROVIDER === "mock") return new MockOcrProvider();
  return null;
}
