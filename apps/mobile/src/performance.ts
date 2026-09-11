export function startTiming(stage: string): (metadata?: Record<string, number>) => void {
  const start = performance.now();
  return (metadata = {}) => {
    if (process.env.EXPO_PUBLIC_PERF_TIMING === "true") console.info("[mobile-performance]", { stage, ms: Math.round((performance.now() - start) * 10) / 10, ...metadata });
  };
}
