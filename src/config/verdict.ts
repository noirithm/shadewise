// Verdict thresholds. All values are PROVISIONAL product settings, explained in docs/VERDICT_LOGIC.md.
//
// The skin colour is a camera estimate and the swatch is a digital approximation of a physical shade,
// so we do not claim finer than about 3.5 colour-difference units (CIEDE2000). For scale: about 1 is
// the smallest step a careful observer can see, and a 4-point lightness error in the photo alone
// moves the difference by about 3.
export const VERDICT = {
  goodMax: 3.5, // colour difference up to this is a "good match"
  closeMax: 7.0, // up to this is a "close match"; above is a "poor match"
  boundaryMargin: 0.5, // within this of a cut-off, confidence drops one level
  tieMargin: 0.5, // shades closer than this to the best one are treated as equally good
  minValidity: 0.6, // capture-validity below this is "can't tell, retake" (same as the capture gate)
  lightnessNoteMin: 3, // mention lighter/darker from this many lightness points
  hueNoteMinDeg: 4, // mention warmer/cooler from this many degrees of hue
  minChromaForHue: 5, // below this the hue angle is unreliable, so no warmth note
} as const;
