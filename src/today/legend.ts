import type { GlyphKind } from "./StitchGlyph";

// What each mark in the weave means, in the order the legend lists them.
export const LEGEND: { kind: GlyphKind; label: string }[] = [
  { kind: "knot", label: "Waiting on you" },
  { kind: "agent", label: "Agent working" },
  { kind: "command", label: "Command" },
  { kind: "working", label: "Working now" },
  { kind: "offer", label: "Offer" },
  { kind: "answered", label: "Offer answered" },
  { kind: "provision", label: "Workspace set up" },
  { kind: "failed", label: "Failed" },
];
