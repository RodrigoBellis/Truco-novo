import { useEffect, useRef, useState } from "react";
import "./AnimatedCounter.css";

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  suffix?: string;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AnimatedCounter({ value, duration = 1100, suffix = "" }: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion() || (typeof document !== "undefined" && document.hidden)) {
      setDisplay(value);
      return;
    }

    startRef.current = null;
    let frame: number;

    const step = (timestamp: number) => {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    // Garante o valor final mesmo se a aba estiver em segundo plano e o rAF for pausado pelo navegador.
    const fallback = window.setTimeout(() => setDisplay(value), duration + 300);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(fallback);
    };
  }, [value, duration]);

  return (
    <span className="animated-counter">
      {display}
      {suffix}
    </span>
  );
}
