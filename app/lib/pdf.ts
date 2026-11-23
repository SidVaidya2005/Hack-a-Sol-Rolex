/** Browser only. Opens untrusted PDF bytes with PDF.js, using its locally bundled worker. */
export async function loadPdf(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  // The worker takes ownership of this buffer, so it gets a copy.
  return {
    pdfjs,
    task: pdfjs.getDocument({
      data: bytes.slice(),
      enableXfa: false,
      disableAutoFetch: true,
      disableStream: true,
      disableRange: true,
      stopAtErrors: true,
    }),
  };
}
