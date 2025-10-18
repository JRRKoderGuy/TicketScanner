import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ScannerState } from './types';

// --- Helper Components (defined outside the main App component) ---

const SuccessIcon: React.FC = () => (
  <svg className="w-24 h-24 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const FailureIcon: React.FC = () => (
  <svg className="w-24 h-24 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

interface ScannerOverlayProps {
  scannerState: ScannerState;
}

const ScannerOverlay: React.FC<ScannerOverlayProps> = ({ scannerState }) => {
  const isFailureMode = scannerState === ScannerState.TICKET_FAILURE;
  const overlayColor = isFailureMode ? 'border-red-500' : 'border-teal-500/50';
  const scannerLineColor = isFailureMode ? 'bg-red-500' : 'bg-teal-400';
  const message = isFailureMode ? 'SCAN FOR EMPLOYEE PASS (RED)' : 'SCAN TICKET BARCODE';

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 pointer-events-none">
      <div className={`w-full h-full border-8 ${overlayColor} rounded-3xl opacity-50`}></div>
      <div className="absolute top-1/2 left-0 w-full h-1 overflow-hidden">
        <div className={`h-full ${scannerLineColor} shadow-[0_0_15px_5px_rgba(255,255,255,0.3)] animate-scan`}></div>
      </div>
      <div className="absolute bottom-16 bg-black/50 px-4 py-2 rounded-lg text-lg font-semibold tracking-widest animate-pulse">
        {message}
      </div>
    </div>
  );
};

interface StatusDisplayProps {
  scannerState: ScannerState;
  onReset: () => void;
}

const StatusDisplay: React.FC<StatusDisplayProps> = ({ scannerState, onReset }) => {
  const renderContent = () => {
    switch (scannerState) {
      case ScannerState.INITIALIZING:
        return <p className="text-xl">Initializing Camera...</p>;
      case ScannerState.CAMERA_ERROR:
        return (
          <div className="text-center">
            <FailureIcon />
            <h2 className="text-3xl font-bold mt-4">Camera Error</h2>
            <p className="mt-2 text-lg text-gray-300">Could not access the camera. Please check permissions.</p>
          </div>
        );
      case ScannerState.TICKET_SUCCESS:
        return (
          <div className="text-center">
            <SuccessIcon />
            <h2 className="text-4xl font-bold mt-4 text-green-300">Welcome to the Theatre!</h2>
          </div>
        );
      case ScannerState.OVERRIDE_SUCCESS:
        return (
          <div className="text-center">
            <SuccessIcon />
            <h2 className="text-4xl font-bold mt-4 text-green-300">Let in by an Employee</h2>
          </div>
        );
      case ScannerState.TICKET_FAILURE:
        return (
          <div className="text-center">
            <FailureIcon />
            <h2 className="text-3xl font-bold mt-4 text-red-300">Ticket Not Recognized</h2>
            <p className="mt-2 text-lg max-w-md mx-auto text-gray-300">
              Please ask an employee for help or click "VOID" to void your request.
            </p>
            <button
              onClick={onReset}
              className="mt-8 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold py-3 px-8 rounded-lg transition-transform transform hover:scale-105"
            >
              VOID
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  const showDisplay = scannerState !== ScannerState.SCANNING_TICKET;

  return (
    <div className={`absolute inset-0 bg-gray-900/90 backdrop-blur-md flex items-center justify-center transition-opacity duration-500 ${showDisplay ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      {renderContent()}
    </div>
  );
};

// --- Main App Component ---

function App() {
  const [scannerState, setScannerState] = useState<ScannerState>(ScannerState.INITIALIZING);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number>();
  const lastDetectionTime = useRef<number>(0);

  const DETECTION_COOLDOWN = 2000; // 2 seconds

  const resetToScanning = useCallback(() => {
    setScannerState(ScannerState.SCANNING_TICKET);
  }, []);

  // FIX: Update processFrame to accept the timestamp argument from requestAnimationFrame.
  const processFrame = useCallback((_time) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      animationFrameId.current = requestAnimationFrame(processFrame);
      return;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (Date.now() - lastDetectionTime.current < DETECTION_COOLDOWN) {
        animationFrameId.current = requestAnimationFrame(processFrame);
        return;
    }

    if (scannerState === ScannerState.SCANNING_TICKET) {
      const scanY = Math.floor(canvas.height / 2);
      const imageData = ctx.getImageData(0, scanY - 1, canvas.width, 3).data;
      let darkPixels = 0;
      for (let i = 0; i < imageData.length; i += 4) {
        if (imageData[i] < 50 && imageData[i + 1] < 50 && imageData[i + 2] < 50) {
          darkPixels++;
        }
      }
      if (darkPixels / (canvas.width * 3) > 0.5) { // If >50% of the horizontal line is dark
        lastDetectionTime.current = Date.now();
        const isUnlucky = Math.random() < 0.15; // 15% chance to fail
        setScannerState(isUnlucky ? ScannerState.TICKET_FAILURE : ScannerState.TICKET_SUCCESS);
      }
    } else if (scannerState === ScannerState.TICKET_FAILURE) {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let redPixels = 0;
      for (let i = 0; i < imageData.length; i += 4) {
        if (imageData[i] > 180 && imageData[i + 1] < 100 && imageData[i + 2] < 100) {
          redPixels++;
        }
      }
      if (redPixels / (canvas.width * canvas.height) > 0.3) { // If >30% of frame is red
        lastDetectionTime.current = Date.now();
        setScannerState(ScannerState.OVERRIDE_SUCCESS);
      }
    }

    animationFrameId.current = requestAnimationFrame(processFrame);
  }, [scannerState]);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setScannerState(ScannerState.SCANNING_TICKET);
        }
      } catch (error) {
        console.error("Error accessing camera:", error);
        setScannerState(ScannerState.CAMERA_ERROR);
      }
    };
    startCamera();
  }, []);

  useEffect(() => {
    const isScanning = scannerState === ScannerState.SCANNING_TICKET || scannerState === ScannerState.TICKET_FAILURE;
    if (isScanning) {
      animationFrameId.current = requestAnimationFrame(processFrame);
    } else {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    }
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [scannerState, processFrame]);

  useEffect(() => {
    if (scannerState === ScannerState.TICKET_SUCCESS || scannerState === ScannerState.OVERRIDE_SUCCESS) {
      const timer = setTimeout(resetToScanning, 3000);
      return () => clearTimeout(timer);
    }
  }, [scannerState, resetToScanning]);

  return (
    <main className="relative h-screen w-screen bg-black flex items-center justify-center font-sans">
      <style>{`
        @keyframes scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        .animate-scan {
          animation: scan 2s linear infinite;
        }
      `}</style>

      <div className="relative w-full h-full max-w-4xl max-h-4xl aspect-video overflow-hidden rounded-3xl shadow-2xl shadow-teal-500/20">
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className="w-full h-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />
        {(scannerState === ScannerState.SCANNING_TICKET || scannerState === ScannerState.TICKET_FAILURE) && (
          <ScannerOverlay scannerState={scannerState} />
        )}
      </div>

      <StatusDisplay scannerState={scannerState} onReset={resetToScanning} />
    </main>
  );
}

export default App;
