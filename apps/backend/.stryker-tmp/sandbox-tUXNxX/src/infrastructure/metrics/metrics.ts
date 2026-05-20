// @ts-nocheck
let requestCount = 0;
const startedAt = Date.now();

export function incrementRequestCount() {
  requestCount += 1;
}

export function getMetricsSnapshot() {
  const uptimeSeconds = Math.round(process.uptime());
  const memory = process.memoryUsage();

  return {
    requestCount,
    uptimeSeconds,
    memory,
    startedAt,
  };
}

