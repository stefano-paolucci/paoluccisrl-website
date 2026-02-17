import Lenis from "lenis";

export type LenisSmoothScrollOptions = {
  duration?: number;
  wheelMultiplier?: number;
  touchMultiplier?: number;
  syncTouch?: boolean;
  syncTouchLerp?: number;
  easing?: (t: number) => number;
};

export function initLenisSmoothScroll(
  options: LenisSmoothScrollOptions = {},
) {
  if (typeof window === "undefined") return null;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;

  const lenis = new Lenis({
    duration: options.duration ?? 1.2,
    smoothWheel: true,
    wheelMultiplier: options.wheelMultiplier ?? 1,
    touchMultiplier: options.touchMultiplier ?? 1.15,
    syncTouch: options.syncTouch ?? true,
    syncTouchLerp: options.syncTouchLerp ?? 0.08,
    easing: options.easing ?? ((t: number) => 1 - Math.pow(2, -10 * t)),
  });

  function raf(time: number) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }

  requestAnimationFrame(raf);
  return lenis;
}
