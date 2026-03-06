"use client";

import { useDialKit } from "dialkit";
import { DialRoot } from "dialkit";
import "dialkit/styles.css";
import { useState, useEffect, useRef } from "react";

/* ─────────────────────────────────────────────────────────
 * WIGGLE TUNER
 *
 * Live controls for the resolve-pulse wiggle animation.
 * Tune values here, then bake finals into styles.module.scss.
 *
 * Current SCSS keyframes to match:
 *   @keyframes resolvePulseGlow — 0.7s linear
 *   rotation: 0 → -4° → 3.5° → -2.5° → 1.5° → -0.5° → 0°
 *   scale:    1 → 1.04 → 1.04 → 1.02 → 1.01 → 1 → 1
 *   glow:     green box-shadow fades in/out
 * ───────────────────────────────────────────────────────── */

export default function TuneWiggle() {
  const params = useDialKit("Wiggle", {
    // Rotation keyframes (dampened oscillation)
    rot1: [-4, -8, 0],
    rot2: [3.5, 0, 8],
    rot3: [-2.5, -6, 0],
    rot4: [1.5, 0, 4],
    rot5: [-0.5, -2, 0],

    // Scale keyframes
    peakScale: [1.04, 1, 1.15],
    midScale: [1.02, 1, 1.08],

    // Timing
    duration: [850, 300, 1200],

    // Glow
    glowOpacity: [0.5, 0, 1],
    glowSpread: [24, 8, 48],

    // Trigger
    fire: { type: "action", label: "Fire Wiggle" },
  }, {
    onAction: (action) => {
      if (action === "fire") triggerWiggle();
    },
  });

  const [wiggling, setWiggling] = useState(false);
  const fabRef = useRef<HTMLDivElement>(null);

  const triggerWiggle = () => {
    setWiggling(false);
    requestAnimationFrame(() => {
      setWiggling(true);
    });
  };

  // Auto-fire on param change
  const paramsKey = JSON.stringify(params);
  useEffect(() => {
    triggerWiggle();
  }, [paramsKey]);

  // Clear wiggling after duration
  useEffect(() => {
    if (!wiggling) return;
    const t = setTimeout(() => setWiggling(false), params.duration);
    return () => clearTimeout(t);
  }, [wiggling, params.duration]);

  // Build dynamic keyframes
  const keyframes = `
    @keyframes tuneWiggle {
      0%   { box-shadow: 0 4px 20px rgba(52, 199, 89, 0);    transform: rotate(0deg) scale(1); }
      10%  { box-shadow: 0 4px ${params.glowSpread}px rgba(52, 199, 89, ${params.glowOpacity}); transform: rotate(${params.rot1}deg) scale(${params.peakScale}); }
      25%  { transform: rotate(${params.rot2}deg) scale(${params.peakScale}); }
      40%  { transform: rotate(${params.rot3}deg) scale(${params.midScale}); }
      55%  { transform: rotate(${params.rot4}deg) scale(${Math.max(1, params.midScale - 0.01)}); }
      70%  { box-shadow: 0 4px ${params.glowSpread}px rgba(52, 199, 89, ${params.glowOpacity * 0.3}); transform: rotate(${params.rot5}deg) scale(1); }
      100% { box-shadow: 0 4px 20px rgba(52, 199, 89, 0);    transform: rotate(0deg) scale(1); }
    }
  `;

  // CSS output for copying
  const scssOutput = `@keyframes resolvePulseGlow {
  0% {
    box-shadow: 0 4px 20px rgba($green, 0);
    transform: rotate(0deg) scale(1);
  }
  10% {
    box-shadow: 0 4px ${params.glowSpread}px rgba($green, ${params.glowOpacity});
    transform: rotate(${params.rot1}deg) scale(${params.peakScale});
  }
  25% {
    transform: rotate(${params.rot2}deg) scale(${params.peakScale});
  }
  40% {
    transform: rotate(${params.rot3}deg) scale(${params.midScale});
  }
  55% {
    transform: rotate(${params.rot4}deg) scale(${Math.max(1, params.midScale - 0.01)});
  }
  70% {
    box-shadow: 0 4px ${params.glowSpread}px rgba($green, ${(params.glowOpacity * 0.3).toFixed(2)});
    transform: rotate(${params.rot5}deg) scale(1);
  }
  100% {
    box-shadow: 0 4px 20px rgba($green, 0);
    transform: rotate(0deg) scale(1);
  }
}

// Duration: ${params.duration}ms linear`;

  return (
    <>
      <DialRoot position="top-right" />
      <style>{keyframes}</style>
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: 48,
        background: "#f5f5f5",
        padding: "2rem",
      }}>
        {/* Mock FAB */}
        <div style={{ position: "relative" }}>
          <div
            ref={fabRef}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              background: "#1a1a1a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.1)",
              animation: wiggling ? `tuneWiggle ${params.duration}ms linear both` : "none",
            }}
            onClick={triggerWiggle}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11.5 12L5.5 12" />
              <path d="M18.5 6.75L5.5 6.75" />
              <path d="M9.25 17.25L5.5 17.25" />
              <path d="M16 12.75L16.5179 13.9677C16.8078 14.6494 17.3506 15.1922 18.0323 15.4821L19.25 16L18.0323 16.5179C17.3506 16.8078 16.8078 17.3506 16.5179 18.0323L16 19.25L15.4821 18.0323C15.1922 17.3506 14.6494 16.8078 13.9677 16.5179L12.75 16L13.9677 15.4821C14.6494 15.1922 15.1922 14.6494 15.4821 13.9677L16 12.75Z" />
            </svg>
          </div>
          {/* Mock activity label */}
          <div style={{
            position: "absolute",
            right: "calc(100% + 20px)",
            top: "50%",
            transform: "translateY(-50%)",
            padding: "6px 10px",
            background: "#1a1a1a",
            color: "rgba(255,255,255,0.9)",
            fontSize: 12,
            fontWeight: 500,
            borderRadius: 8,
            whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}>
            <span style={{ opacity: 0.5, fontVariantNumeric: "tabular-nums" }}>
              Reading files 1/3
            </span>
          </div>
        </div>

        <p style={{ fontSize: 13, color: "#888", textAlign: "center" }}>
          Click the FAB or use the &quot;Fire Wiggle&quot; button to preview.<br />
          Values auto-fire on change.
        </p>

        {/* SCSS output */}
        <details style={{ width: "100%", maxWidth: 520 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, color: "#666", marginBottom: 8 }}>
            Copy SCSS output
          </summary>
          <pre style={{
            background: "#1a1a1a",
            color: "#e0e0e0",
            padding: 16,
            borderRadius: 8,
            fontSize: 11,
            overflow: "auto",
            lineHeight: 1.5,
          }}>
            {scssOutput}
          </pre>
        </details>
      </div>
    </>
  );
}
