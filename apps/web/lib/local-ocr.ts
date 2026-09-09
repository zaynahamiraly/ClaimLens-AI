import "server-only";

type OcrDocument = {
  original_name: string;
  mime_type: string;
};

const LOCAL_OCR_TIMEOUT_MS = 180_000;
const MAX_LOCAL_OCR_PAGES = 10;

export async function transcribeLocally(document: OcrDocument, bytes: Uint8Array) {
  const startedAt = Date.now();
  console.log("[local-ocr] loading worker", { document: document.original_name, bytes: bytes.byteLength });
  const [{ createWorker }, canvas] = await Promise.all([
    import("tesseract.js"),
    import("@napi-rs/canvas"),
  ]);
  for (const [name, value] of Object.entries({
    DOMMatrix: canvas.DOMMatrix,
    ImageData: canvas.ImageData,
    Path2D: canvas.Path2D,
  })) {
    if (!(name in globalThis)) Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
  }

  const worker = await createWorker("eng", 1, { cachePath: "/tmp" });
  console.log("[local-ocr] worker ready", { document: document.original_name, elapsedMs: Date.now() - startedAt });
  try {
    const recognition = async () => {
      if (document.mime_type !== "application/pdf") {
        const result = await worker.recognize(Buffer.from(bytes));
        return { text: result.data.text.trim(), confidence: result.data.confidence / 100 };
      }

      const { pdf: renderPdf } = await import("pdf-to-img");
      const rendered = await renderPdf(bytes, { scale: 2, format: "png" });
      try {
        if (rendered.length > MAX_LOCAL_OCR_PAGES) {
          throw new Error(`${document.original_name} exceeds the ${MAX_LOCAL_OCR_PAGES}-page local OCR limit.`);
        }
        const pages: string[] = [];
        const confidences: number[] = [];
        for await (const page of rendered) {
          const result = await worker.recognize(page);
          const text = result.data.text.trim();
          if (text) {
            pages.push(text);
            confidences.push(result.data.confidence / 100);
          }
        }
        return {
          text: pages.join("\n\n"),
          confidence: confidences.length
            ? confidences.reduce((total, value) => total + value, 0) / confidences.length
            : 0,
        };
      } finally {
        await rendered.destroy();
      }
    };

    const text = await Promise.race([
      recognition(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Local OCR timed out for ${document.original_name}.`)), LOCAL_OCR_TIMEOUT_MS)),
    ]);
    console.log("[local-ocr] recognition completed", { document: document.original_name, characters: text.text.length, confidence: text.confidence, elapsedMs: Date.now() - startedAt });
    return text;
  } finally {
    await worker.terminate();
  }
}
