import { useEffect, useRef } from "react";
import { AUTO_LOCK_MS, AutoLockDuration } from "@/lib/appSettings";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "wheel", "touchstart"];

export function useAutoLock(duration: AutoLockDuration, enabled: boolean, onLock: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const ms = AUTO_LOCK_MS[duration];
    if (!enabled || !ms) return;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(onLock, ms);
    };

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, resetTimer));
    resetTimer();

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [duration, enabled, onLock]);
}