// The palette of meaning (task 0105), from the theme's own tokens: each trio (`*-bg`, `*-line`, `*-fg`) and the icon colour exist for the light and the dark theme, so a tone is as readable as an
// alert is. Class names are written out in full because Tailwind finds them by reading the source.

export type Tone = "ok" | "info" | "warn" | "danger" | "brand" | "neutral";

export const TONE: Record<
  Tone,
  {
    /// A pill or a block: tinted background, border, text.
    chip: string;
    /// A small square that holds an icon.
    tile: string;
    /// Just the colour of an icon or a number.
    icon: string;
    /// A solid strip along the edge of a card.
    rail: string;
    /// A solid piece of a bar.
    bar: string;
    /// The paler piece of a bar (the part not yet reached).
    barTrack: string;
  }
> = {
  ok: {
    chip: "border-ok-line bg-ok-bg text-ok-fg",
    tile: "bg-ok-bg text-ok-icon",
    icon: "text-ok-icon",
    rail: "bg-ok-icon",
    bar: "bg-ok-icon",
    barTrack: "bg-ok-bg border border-ok-line",
  },
  info: {
    chip: "border-info-line bg-info-bg text-info-fg",
    tile: "bg-info-bg text-info-icon",
    icon: "text-info-icon",
    rail: "bg-info-icon",
    bar: "bg-info-icon",
    barTrack: "bg-info-bg border border-info-line",
  },
  warn: {
    chip: "border-warn-line bg-warn-bg text-warn-fg",
    tile: "bg-warn-bg text-warn-icon",
    icon: "text-warn-icon",
    rail: "bg-warn-icon",
    bar: "bg-warn-icon",
    barTrack: "bg-warn-bg border border-warn-line",
  },
  danger: {
    chip: "border-danger-line bg-danger-bg text-danger-fg",
    tile: "bg-danger-bg text-danger-icon",
    icon: "text-danger-icon",
    rail: "bg-danger-icon",
    bar: "bg-danger-icon",
    barTrack: "bg-danger-bg border border-danger-line",
  },
  brand: {
    chip: "border-brand-strong/40 bg-brand-tint text-brand-fg",
    tile: "bg-brand-tint text-brand-fg",
    icon: "text-brand-fg",
    rail: "bg-brand",
    bar: "bg-brand",
    barTrack: "bg-brand-tint border border-brand-strong/30",
  },
  neutral: {
    chip: "border-line bg-surface-2 text-fg-2",
    tile: "bg-surface-2 text-fg-2",
    icon: "text-fg-muted",
    rail: "bg-line-strong",
    bar: "bg-line-strong",
    barTrack: "bg-surface-2 border border-line",
  },
};
