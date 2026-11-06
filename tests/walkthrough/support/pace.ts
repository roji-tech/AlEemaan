/**
 * Pacing for the continuous product walkthrough.
 *
 * The pauses around a click (glide, hover, settle, dwell) can be shortened with WALKTHROUGH_SPEED_SCALE for a recon run. Typing cannot: a person types at 50 to 120 ms a key, and a
 * video that types faster is not showing what a person would do. The scale never touches key delays.
 */

export interface PaceConfig {
  /** Number of interpolation steps between current cursor position and target */
  glideSteps: number;
  /** Pause in ms upon hovering target before initiating mouse click */
  beforeClick: number;
  /** Pause in ms after click to display button active/ripple state */
  afterClick: number;
  /** Pause in ms for DOM transitions and UI animations to settle */
  settle: number;
  /** Pause in ms at the end of each step to frame the caption */
  dwell: number;
}

/** A person's gap between two key presses, in milliseconds. */
export const KEY_DELAY_MIN_MS = 50;
export const KEY_DELAY_MAX_MS = 120;

/** `random` is injectable so that the bounds can be tested exactly. */
export const keyDelay = (random: () => number = Math.random): number =>
  KEY_DELAY_MIN_MS + Math.floor(random() * (KEY_DELAY_MAX_MS - KEY_DELAY_MIN_MS + 1));

/** The most typing a whole pass may contain, in minutes. Fixture text is kept short to stay inside it. */
export const TYPING_BUDGET_MINUTES = 12;

const scale = Number(process.env.WALKTHROUGH_SPEED_SCALE ?? "1") || 1;

export const pace: PaceConfig = {
  glideSteps: Math.max(4, Math.round(10 * scale)),
  beforeClick: Math.max(40, Math.round(120 * scale)),
  afterClick: Math.max(50, Math.round(180 * scale)),
  settle: Math.max(80, Math.round(300 * scale)),
  dwell: Math.max(150, Math.round(600 * scale)),
};
