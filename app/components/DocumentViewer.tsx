"use client";

import type { RadoDocument } from "@rado/shared";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

import { loadPdf } from "../lib/pdf";

const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2];
const MAX_PAGES = 100;
const MAX_CANVAS_PIXELS = 16_000_000;
const MAX_IMAGE_PIXELS = 40_000_000;

export function formatDocumentSize(size: number) {
  return size < 1_000 ? `${size} B` : `${Math.round(size / 1_000)} KB`;
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * Draws pages onto a canvas with annotations off, so a file's scripts, links, and forms never run.
 * Decrypted bytes stay in memory and are cleared when this closes.
 */
export function DocumentViewer({
  document: file,
  canDownload,
  onClose,
}: {
  document: RadoDocument;
  canDownload: boolean;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [annotationOff, setAnnotationOff] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmingDownload, setConfirmingDownload] = useState(false);
  const isPdf = file.mime === "application/pdf";
  const pages = pdf ? Math.min(pdf.numPages, MAX_PAGES) : 1;

  useEffect(() => {
    if (!isPdf) return;
    let current = true;
    let destroy: (() => void) | undefined;
    void (async () => {
      try {
        const { pdfjs, task } = await loadPdf(file.bytes);
        destroy = () => void task.destroy();
        if (!current) {
          destroy();
          return;
        }
        const loaded = await task.promise;
        if (!current) return;
        setAnnotationOff(pdfjs.AnnotationMode.DISABLE);
        setPdf(loaded);
      } catch {
        if (current) {
          setError("This PDF could not be displayed. It may be damaged or password-protected.");
          setLoading(false);
        }
      }
    })();
    return () => {
      current = false;
      destroy?.();
    };
  }, [file.bytes, isPdf]);

  useEffect(() => {
    if (!isPdf || !pdf || !canvasRef.current) return;
    const canvas = canvasRef.current;
    let current = true;
    let cancel: (() => void) | undefined;
    void (async () => {
      setLoading(true);
      try {
        const pdfPage = await pdf.getPage(page);
        if (!current) return;
        const base = pdfPage.getViewport({ scale: zoom * 1.5 });
        const limit = Math.sqrt(MAX_CANVAS_PIXELS / Math.max(base.width * base.height, 1));
        const viewport = pdfPage.getViewport({ scale: zoom * 1.5 * Math.min(limit, 1) });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const task = pdfPage.render({ canvas, viewport, annotationMode: annotationOff });
        cancel = () => task.cancel();
        await task.promise;
        if (current) setError("");
      } catch (caught) {
        if (current && (caught as { name?: string })?.name !== "RenderingCancelledException") {
          setError("This page could not be displayed.");
        }
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => {
      current = false;
      cancel?.();
    };
  }, [annotationOff, isPdf, page, pdf, zoom]);

  useEffect(() => {
    if (isPdf || !canvasRef.current) return;
    const canvas = canvasRef.current;
    let current = true;
    void (async () => {
      setLoading(true);
      let bitmap: ImageBitmap | undefined;
      try {
        // A copy with a narrowed buffer type, as Blob requires.
        const blob = new Blob([file.bytes.slice().buffer as ArrayBuffer], { type: file.mime });
        bitmap = await createImageBitmap(blob);
        if (!current) return;
        if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
          throw new Error("Image too large");
        }
        const limit = Math.sqrt(
          MAX_CANVAS_PIXELS / Math.max(bitmap.width * bitmap.height * zoom * zoom, 1),
        );
        const scale = zoom * Math.min(limit, 1);
        canvas.width = Math.floor(bitmap.width * scale);
        canvas.height = Math.floor(bitmap.height * scale);
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        setError("");
      } catch {
        if (current) setError("This image could not be displayed.");
      } finally {
        bitmap?.close();
        if (current) setLoading(false);
      }
    })();
    return () => {
      current = false;
    };
  }, [file.bytes, file.mime, isPdf, zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    return () => clearCanvas(canvas);
  }, []);

  function download() {
    const blob = new Blob([file.bytes.slice().buffer as ArrayBuffer], { type: file.mime });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setConfirmingDownload(false);
  }

  const zoomIndex = ZOOM_STEPS.indexOf(zoom);

  return (
    <div className="motion-reveal mt-3 rounded-lg border border-rado-line">
      <div className="flex flex-wrap items-center gap-2 border-b border-rado-line px-4 py-2">
        <p className="min-w-0 flex-1 truncate text-sm text-rado-ink">{file.name}</p>
        {isPdf ? (
          <div className="flex items-center gap-1">
            <button
              aria-label="Previous page"
              className="button-pill-outline !px-3 !py-1 disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
              type="button"
            >
              ‹
            </button>
            <span className="px-1 font-mono text-xs text-rado-slate">
              Page {page} of {pages}
            </span>
            <button
              aria-label="Next page"
              className="button-pill-outline !px-3 !py-1 disabled:opacity-50"
              disabled={page >= pages}
              onClick={() => setPage((value) => value + 1)}
              type="button"
            >
              ›
            </button>
          </div>
        ) : null}
        <button
          aria-label="Zoom out"
          className="button-pill-outline !px-3 !py-1 disabled:opacity-50"
          disabled={zoomIndex <= 0}
          onClick={() => setZoom(ZOOM_STEPS[zoomIndex - 1])}
          type="button"
        >
          −
        </button>
        <button
          aria-label="Zoom in"
          className="button-pill-outline !px-3 !py-1 disabled:opacity-50"
          disabled={zoomIndex >= ZOOM_STEPS.length - 1}
          onClick={() => setZoom(ZOOM_STEPS[zoomIndex + 1])}
          type="button"
        >
          +
        </button>
        {canDownload ? (
          <button
            className="button-pill-outline !py-1"
            onClick={() => setConfirmingDownload(true)}
            type="button"
          >
            Download
          </button>
        ) : null}
        <button
          aria-label="Close document"
          className="button-pill-outline !px-3 !py-1"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>
      {confirmingDownload ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-rado-line bg-rado-stone-wash px-4 py-3">
          <p className="min-w-0 flex-1 text-xs text-rado-ink">
            The downloaded file is readable by anyone with access to this device.
          </p>
          <button className="button-pill-outline !py-1" onClick={download} type="button">
            Download readable copy
          </button>
          <button
            className="button-pill-outline !py-1"
            onClick={() => setConfirmingDownload(false)}
            type="button"
          >
            Cancel
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="px-4 py-3 text-sm text-rado-error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p className="px-4 py-3 text-sm text-rado-slate">Rendering…</p> : null}
      <div className="max-h-[70vh] overflow-auto bg-rado-stone-wash p-3">
        <canvas
          aria-label={`Contents of ${file.name}`}
          className="mx-auto block max-w-none bg-white"
          ref={canvasRef}
        />
      </div>
      <p className="px-4 py-2 text-xs text-rado-slate">
        Decrypted only in this browser · {formatDocumentSize(file.size)}
      </p>
    </div>
  );
}
