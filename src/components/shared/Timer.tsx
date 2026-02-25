"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, Eye, EyeOff } from "lucide-react";

interface TimerProps {
  isRunning: boolean;
  onElapsedChange?: (ms: number) => void;
}

export function Timer({ isRunning, onElapsedChange }: TimerProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setElapsedMs((prev) => {
        const next = prev + 1000;
        onElapsedChange?.(next);
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, onElapsedChange]);

  const formatTime = useCallback((ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }, []);

  return (
    <div className="flex items-center gap-2">
      <Clock className="w-4 h-4 text-slate-gray/60" />
      {visible ? (
        <span className="text-sm font-mono font-medium text-slate-gray tabular-nums">
          {formatTime(elapsedMs)}
        </span>
      ) : (
        <span className="text-sm text-slate-gray/40">--:--</span>
      )}
      <button
        onClick={() => setVisible(!visible)}
        className="p-1 rounded text-slate-gray/40 hover:text-slate-gray transition-colors"
        title={visible ? "Hide timer" : "Show timer"}
      >
        {visible ? (
          <EyeOff className="w-3.5 h-3.5" />
        ) : (
          <Eye className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}
