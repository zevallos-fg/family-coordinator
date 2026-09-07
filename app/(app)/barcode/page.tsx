"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BarcodeScanner } from "@/components/barcode/BarcodeScanner";
import { BarcodeResult } from "@/components/barcode/BarcodeResult";
import { lookupBarcodeAction, type LookupBarcodeResult } from "@/app/(app)/barcode/actions";

type Phase = "scanning" | "loading" | "result";

export default function BarcodePage() {
  const [phase, setPhase] = useState<Phase>("scanning");
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<LookupBarcodeResult | null>(null);

  const handleScan = useCallback(async (barcode: string) => {
    setScannedBarcode(barcode);
    setPhase("loading");

    try {
      const result = await lookupBarcodeAction(barcode);
      setLookupResult(result);
      if (result.warning) toast.warning(result.warning, { duration: 8000 });
      setPhase("result");
    } catch {
      toast.error("Lookup failed. Try again.");
      setPhase("scanning");
    }
  }, []);

  function handleScanAgain() {
    setPhase("scanning");
    setScannedBarcode(null);
    setLookupResult(null);
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/receipts" className="text-stone-400 hover:text-stone-600 text-xl leading-none">
            ←
          </Link>
          <h1 className="text-xl font-bold text-stone-800">Barcode scanner</h1>
        </div>

        <div className="space-y-6">
          {phase === "scanning" && (
            <>
              <BarcodeScanner onScan={handleScan} active={phase === "scanning"} />
              <p className="text-center text-stone-400 text-sm">
                Scans UPC-A, EAN-13, and QR codes
              </p>
            </>
          )}

          {phase === "loading" && (
            <div className="rounded-2xl bg-amber-50 border border-amber-100 p-8 text-center space-y-3">
              <div className="text-3xl animate-pulse">🔍</div>
              <p className="text-amber-800 font-medium">Looking up barcode…</p>
              <p className="text-amber-600 text-sm font-mono">{scannedBarcode}</p>
            </div>
          )}

          {phase === "result" && lookupResult && scannedBarcode && (
            <BarcodeResult
              barcode={scannedBarcode}
              result={lookupResult}
              onScanAgain={handleScanAgain}
            />
          )}
        </div>
      </div>
    </main>
  );
}
