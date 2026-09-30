'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** Client-side QR code (SVG) for any string, e.g. a `upi://pay?...` URI. */
export function QrCode({ value, size = 220, label }: { value: string; size?: number; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', width: size })
      .then((s) => {
        if (!cancelled) {
          setSvg(s);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (failed) {
    return <p className="text-[14px] text-signal">Could not generate the QR code.</p>;
  }
  return (
    <div
      role="img"
      aria-label={label}
      className="inline-block rounded-[16px] border border-hairline bg-white p-2"
      style={{ width: size + 18, height: size + 18 }}
      // SVG is generated locally by the qrcode library from our own string; no user HTML is injected.
      dangerouslySetInnerHTML={{ __html: svg ?? '' }}
    />
  );
}
