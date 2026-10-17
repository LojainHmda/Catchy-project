import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import jsQR from 'jsqr';
import { Camera, Flashlight, FlashlightOff, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

type PosQrScannerProps = {
  onScan: (text: string) => void;
  onClose: () => void;
};

type ScanStatus = 'starting' | 'scanning' | 'error';

/**
 * Live camera QR scanner. Uses jsQR (pure JS, canvas-based) rather than the
 * native BarcodeDetector API so it works consistently across Android, iOS
 * Safari, and desktop browsers with a webcam — BarcodeDetector still isn't
 * available on iOS Safari in enough versions to rely on it here.
 */
const PosQrScanner: React.FC<PosQrScannerProps> = ({ onScan, onClose }) => {
  const { t, isRTL, language } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [status, setStatus] = useState<ScanStatus>('starting');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const scanLoop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(scanLoop);
        return;
      }
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        rafRef.current = requestAnimationFrame(scanLoop);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
      if (code?.data) {
        onScan(code.data);
        onClose();
        return;
      }
      rafRef.current = requestAnimationFrame(scanLoop);
    };

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
        if (capabilities && 'torch' in capabilities) setTorchSupported(true);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('scanning');
        rafRef.current = requestAnimationFrame(scanLoop);
      } catch {
        if (!cancelled) setStatus('error');
      }
    };

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] } as unknown as MediaTrackConstraints);
      setTorchOn((v) => !v);
    } catch {
      // Torch control not actually supported despite the capability flag — ignore.
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        dir={isRTL ? 'rtl' : 'ltr'}
        lang={language}
        className={`fixed inset-0 z-[350] flex flex-col bg-black ${isRTL ? 'font-arabic' : ''}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="relative flex-1 overflow-hidden">
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />

          {status === 'scanning' ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-64 w-64 max-w-[70vw]">
                <div className="absolute inset-0 rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
                <div className="absolute -top-1 -left-1 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-catchy" />
                <div className="absolute -top-1 -right-1 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-catchy" />
                <div className="absolute -bottom-1 -left-1 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-catchy" />
                <div className="absolute -bottom-1 -right-1 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-catchy" />
              </div>
            </div>
          ) : null}

          {status === 'starting' ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <p className="text-sm font-medium text-white">{t('pos.qr.starting')}</p>
            </div>
          ) : null}

          {status === 'error' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-950 p-6 text-center">
              <Camera className="h-10 w-10 text-neutral-600" />
              <p className="text-sm font-semibold text-white">{t('pos.qr.cameraError')}</p>
              <p className="max-w-xs text-xs text-neutral-500">{t('pos.qr.cameraErrorHint')}</p>
            </div>
          ) : null}

          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition active:scale-90"
              aria-label={t('pos.qr.close')}
            >
              <X size={20} />
            </button>
            {torchSupported ? (
              <button
                type="button"
                onClick={toggleTorch}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition active:scale-90"
                aria-label="Torch"
              >
                {torchOn ? <FlashlightOff size={18} /> : <Flashlight size={18} />}
              </button>
            ) : null}
          </div>

          {status === 'scanning' ? (
            <p className="absolute inset-x-0 bottom-8 text-center text-sm font-medium text-white/90">
              {t('pos.qr.instructions')}
            </p>
          ) : null}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default PosQrScanner;
