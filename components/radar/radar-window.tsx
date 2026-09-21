// components/radar/radar-window.tsx — Single Polar Radar Window Component.
// Renders polar concentric maturity zones, category axes, and interactive topic nodes with SVG.

"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import type { RadarNode, TimeWindow } from "@/lib/trends/types";

interface RadarWindowProps {
  windowType: TimeWindow;
  title: string;
  subtitle: string;
  nodes: RadarNode[];
  hoveredMarketId: string | null;
  onHoverNode: (node: RadarNode | null) => void;
  onSelectNode: (node: RadarNode) => void;
  className?: string;
}

export function RadarWindow({
  windowType,
  title,
  subtitle,
  nodes,
  hoveredMarketId,
  onHoverNode,
  onSelectNode,
  className = "",
}: RadarWindowProps) {
  return (
    <div className={`relative flex flex-col rounded-xl border border-border/80 bg-card/60 p-4 backdrop-blur-xs shadow-xs ${className}`}>
      {/* Window Header */}
      <div className="flex items-center justify-between pb-2 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-heading font-semibold text-sm">{title}</span>
            <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
              {windowType}
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <div className="text-right">
          <span className="font-mono text-xs font-semibold text-primary">{nodes.length}</span>
          <span className="text-[10px] text-muted-foreground ml-1">topics</span>
        </div>
      </div>

      {/* Radar SVG Surface */}
      <div className="relative aspect-square w-full my-2 flex items-center justify-center select-none overflow-hidden">
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full transform-gpu"
          aria-label={`Market Radar for ${windowType}`}
        >
          {/* Background Radial Gradients */}
          <defs>
            <radialGradient id={`radar-grad-${windowType}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.08" />
              <stop offset="35%" stopColor="var(--color-primary)" stopOpacity="0.03" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Outer Boundary & Polar Fill */}
          <circle cx="50" cy="50" r="42" fill={`url(#radar-grad-${windowType})`} />

          {/* Concentric Maturity Rings */}
          {/* Ring 3: Saturated / Established Outer Band */}
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
            className="text-border/80"
          />
          {/* Ring 2: Accelerating Growth Mid Band */}
          <circle
            cx="50"
            cy="50"
            r="27.3"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.4"
            strokeDasharray="1.5 1.5"
            className="text-border/60"
          />
          {/* Ring 1: Emerging Breakout Core */}
          <circle
            cx="50"
            cy="50"
            r="12.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
            strokeDasharray="1 1"
            className="text-primary/40"
          />

          {/* Quadrant Crosshair Lines */}
          <line
            x1="8"
            y1="50"
            x2="92"
            y2="50"
            stroke="currentColor"
            strokeWidth="0.3"
            strokeDasharray="1 1"
            className="text-border/60"
          />
          <line
            x1="50"
            y1="8"
            x2="50"
            y2="92"
            stroke="currentColor"
            strokeWidth="0.3"
            strokeDasharray="1 1"
            className="text-border/60"
          />

          {/* Quadrant Thematic Sector Labels */}
          <text x="86" y="48" fontSize="3" textAnchor="end" className="fill-muted-foreground/60 font-mono">
            Tech
          </text>
          <text x="14" y="48" fontSize="3" textAnchor="start" className="fill-muted-foreground/60 font-mono">
            Business
          </text>
          <text x="52" y="14" fontSize="3" textAnchor="start" className="fill-muted-foreground/60 font-mono">
            Creator
          </text>
          <text x="52" y="88" fontSize="3" textAnchor="start" className="fill-muted-foreground/60 font-mono">
            Education
          </text>

          {/* Ring Zone Annotations */}
          <text x="50" y="40" fontSize="2.5" textAnchor="middle" className="fill-primary/60 font-medium">
            Emerging
          </text>
          <text x="50" y="24" fontSize="2.2" textAnchor="middle" className="fill-muted-foreground/50">
            Accelerating
          </text>
          <text x="50" y="10" fontSize="2.2" textAnchor="middle" className="fill-muted-foreground/40">
            Established
          </text>

          {/* Interactive Topic Nodes */}
          {nodes.map((node) => {
            const isHovered = hoveredMarketId === node.analysis.marketId;
            const r = Math.max(1.8, node.coordinates.dotSize / 4);
            const { x, y, velocityColor } = node.coordinates;

            return (
              <g
                key={node.analysis.marketId}
                className="cursor-pointer transition-transform duration-150"
                onMouseEnter={() => {
                  onHoverNode(node);
                }}
                onMouseLeave={() => {
                  onHoverNode(null);
                }}
                onClick={() => onSelectNode(node)}
              >
                {/* Highlight Halo on Hover */}
                {isHovered && (
                  <circle
                    cx={x}
                    cy={y}
                    r={r + 3.5}
                    fill={velocityColor}
                    fillOpacity="0.25"
                    stroke={velocityColor}
                    strokeWidth="0.8"
                    filter="url(#glow)"
                    className="animate-ping"
                  />
                )}

                {/* Pulse Ring for Emerging Breakout Nodes */}
                {node.analysis.classification === "emerging" && (
                  <circle
                    cx={x}
                    cy={y}
                    r={r + 1.8}
                    fill="none"
                    stroke={velocityColor}
                    strokeWidth="0.4"
                    opacity="0.6"
                    className="animate-pulse"
                  />
                )}

                {/* Trajectory Vector Arrow if moving */}
                {isHovered && node.coordinates.deltaArrow.direction !== "stable" && (
                  <line
                    x1={x}
                    y1={y}
                    x2={x + (node.coordinates.deltaArrow.direction === "inward" ? -3 : 3)}
                    y2={y}
                    stroke={velocityColor}
                    strokeWidth="0.7"
                    strokeLinecap="round"
                  />
                )}

                {/* Core Topic Node Dot */}
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? r + 1.2 : r}
                  fill={velocityColor}
                  stroke="#ffffff"
                  strokeWidth={isHovered ? "0.8" : "0.4"}
                  className="transition-all duration-150 drop-shadow-sm"
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Window Legend Mini-Bar */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-emerald-500 inline-block" /> Emerging
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-violet-500 inline-block" /> Growth
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-amber-500 inline-block" /> Early
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-slate-500 inline-block" /> Mature
        </span>
      </div>
    </div>
  );
}
