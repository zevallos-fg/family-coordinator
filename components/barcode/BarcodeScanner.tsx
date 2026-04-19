"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  onScan: (barcode: string) => void;
  active: boolean;
}

export function BarcodeScanner({ onScan, active }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scannedRef = useRef(false);

  useEffect(() => {
    if (!active) return;

    let stopped = false;

    async function startScanner() {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("barcode-reader");
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 280, height: 120 } },
          (decodedText) => {
            if (scannedRef.current || stopped) return;
            scannedRef.current = true;
            onScan(decodedText);
          },
          () => {}
        );
      } catch (err) {
        if (!stopped) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not access camera. Check permissions."
          );
        }
      }
    }

    scannedRef.current = false;
    startScanner();

    return () => {
      stopped = true;
      scannerRef.current
        ?.stop()
        .catch(() => {})
        .finally(() => {
          scannerRef.current?.clear();
          scannerRef.current = null;
        });
    };
  }, [active, onScan]);

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-100 p-6 text-center">
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden bg-black">
      <div id="barcode-reader" ref={containerRef} className="w-full" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="border-2 border-amber-400 rounded-lg w-72 h-28 opacity-70" />
      </div>
      <p className="absolute bottom-4 left-0 right-0 text-center text-white/70 text-xs">
        Hold barcode steady in the frame
      </p>
    </div>
  );
}
