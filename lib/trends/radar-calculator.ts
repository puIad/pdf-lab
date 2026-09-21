// lib/trends/radar-calculator.ts — Radar Polar Coordinate and Trajectory Calculator.
// Projects multi-window trend metrics into polar coordinates (r, theta) -> (x, y)
// and computes cross-window trajectory deltas.

import type {
  RadarCoordinates,
  RadarNode,
  RadarSnapshot,
  TimeWindow,
  TopicTrendAnalysis,
} from "./types.ts";

const CATEGORY_ANGLES: Record<string, { start: number; end: number }> = {
  tech: { start: 25, end: 75 },
  programming: { start: 25, end: 75 },
  devops: { start: 25, end: 75 },
  ai: { start: 25, end: 75 },

  creator: { start: 115, end: 165 },
  video: { start: 115, end: 165 },
  design: { start: 115, end: 165 },
  audio: { start: 115, end: 165 },

  business: { start: 205, end: 255 },
  finance: { start: 205, end: 255 },
  productivity: { start: 205, end: 255 },
  freelance: { start: 205, end: 255 },

  education: { start: 295, end: 345 },
  lifestyle: { start: 295, end: 345 },
  general: { start: 295, end: 345 },
};

function stringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function calculateTopicCoordinates(
  analysis: TopicTrendAnalysis,
  targetWindow: TimeWindow
): RadarCoordinates {
  // 1. Calculate Radius (r in 0.08..0.94) based on maturity and target window
  let baseRadius = 0.5;
  const metrics = analysis.windows[targetWindow];
  const vol = metrics?.weightedVolume || 1;

  switch (analysis.classification) {
    case "emerging":
      // Emerging is closest to center in 7d/30d
      baseRadius = targetWindow === "7d" ? 0.16 : targetWindow === "30d" ? 0.24 : 0.38;
      break;
    case "early_signal":
      baseRadius = targetWindow === "7d" ? 0.22 : 0.32;
      break;
    case "accelerating":
      baseRadius = targetWindow === "7d" ? 0.32 : targetWindow === "30d" ? 0.44 : 0.56;
      break;
    case "seasonal":
      baseRadius = 0.52;
      break;
    case "stable":
      baseRadius = 0.78;
      break;
    case "declining":
      baseRadius = 0.9;
      break;
    case "unknown":
    default:
      baseRadius = 0.65;
      break;
  }

  // Micro-jitter by topic ID so multiple topics in the same class don't overlap completely
  const hash = stringHash(analysis.marketId + analysis.topicName);
  const jitterRadius = ((hash % 100) - 50) / 1000; // -0.05 .. +0.05
  const radius = Math.min(0.95, Math.max(0.08, baseRadius + jitterRadius));

  // 2. Calculate Angle (theta in 0..360) based on category sector
  const catSector = CATEGORY_ANGLES[analysis.category.toLowerCase()] || CATEGORY_ANGLES.general;
  const angleSpan = catSector.end - catSector.start;
  const angleOffset = (hash % 1000) / 1000;
  const angleDegrees = Math.round((catSector.start + angleSpan * angleOffset) * 10) / 10;

  // 3. Project to Cartesian (x, y) on 100x100 grid centered at (50, 50)
  const MAX_RENDER_R = 42; // Leave margin inside 100x100
  const rad = (angleDegrees * Math.PI) / 180;
  const x = Math.round((50 + radius * MAX_RENDER_R * Math.cos(rad)) * 10) / 10;
  const y = Math.round((50 - radius * MAX_RENDER_R * Math.sin(rad)) * 10) / 10;

  // 4. Dot Size scaled logarithmically by window volume
  const dotSize = Math.min(22, Math.max(5, Math.round(4 + 4.5 * Math.log1p(vol))));

  // 5. Velocity Heat Color
  let velocityColor = "#64748B"; // slate
  if (analysis.classification === "emerging") {
    velocityColor = "#10B981"; // emerald
  } else if (analysis.classification === "accelerating") {
    velocityColor = "#8B5CF6"; // violet
  } else if (analysis.classification === "early_signal") {
    velocityColor = "#F59E0B"; // amber
  } else if (analysis.classification === "seasonal") {
    velocityColor = "#06B6D4"; // cyan
  }

  // 6. Cross-Window Trajectory Delta
  // Compare 7d vs 30d volume to determine if it is surging inward or maturing outward
  const v7d = analysis.windows["7d"].weightedVolume;
  const v30d = analysis.windows["30d"].weightedVolume;
  let direction: "inward" | "outward" | "stable" = "stable";
  let label = "0% delta";

  if (analysis.wowDeltaPercent >= 20) {
    direction = "inward";
    label = `+${analysis.wowDeltaPercent}% burst`;
  } else if (v30d > v7d * 4) {
    direction = "outward";
    label = `${analysis.momDeltaPercent >= 0 ? "+" : ""}${analysis.momDeltaPercent}% mature`;
  }

  const magnitude = Math.min(10, Math.max(2, Math.abs(analysis.wowDeltaPercent) / 10));
  const dx = direction === "inward" ? -Math.cos(rad) * magnitude : Math.cos(rad) * magnitude;
  const dy = direction === "inward" ? Math.sin(rad) * magnitude : -Math.sin(rad) * magnitude;

  return {
    radius: Math.round(radius * 100) / 100,
    angleDegrees,
    x,
    y,
    dotSize,
    velocityColor,
    deltaArrow: {
      direction,
      magnitude: Math.round(magnitude * 10) / 10,
      label,
      dx: Math.round(dx * 10) / 10,
      dy: Math.round(dy * 10) / 10,
    },
  };
}

export function buildRadarSnapshot(
  analyses: TopicTrendAnalysis[],
  targetWindow: TimeWindow
): RadarSnapshot {
  const nodes: RadarNode[] = analyses.map((analysis) => ({
    analysis,
    coordinates: calculateTopicCoordinates(analysis, targetWindow),
  }));

  const emergingCount = analyses.filter((a) => a.classification === "emerging").length;
  const acceleratingCount = analyses.filter((a) => a.classification === "accelerating").length;
  const seasonalCount = analyses.filter((a) => a.classification === "seasonal").length;
  const solvableCount = analyses.filter((a) => a.solvable).length;

  const totalMomentum = analyses.reduce((sum, a) => sum + a.momentumScore, 0);
  const avgMomentum = analyses.length > 0 ? Math.round((totalMomentum / analyses.length) * 10) / 10 : 0;

  return {
    window: targetWindow,
    snapshotAt: new Date().toISOString(),
    nodes,
    summary: {
      totalTopics: analyses.length,
      emergingCount,
      acceleratingCount,
      seasonalCount,
      solvableCount,
      avgMomentum,
    },
  };
}
