# How the shade verdict works

The verdict is computed by a deterministic module with no network calls (`src/shared/verdictEngine.ts`). The same inputs always give the same answer, and every sentence shown to a shopper is built from a fixed template and a number.

## Inputs

- **Measured skin colour**: one hex colour returned by the YouCam skin tone analysis for the shopper's photo.
- **Shade swatch**: the demo catalogue's own colour for the shade (self-defined demo data).
- **Capture-quality score (0 to 1)**: from the free on-device check before any API call.
- **Quality confirmation**: whether the API's own photo-quality block reported everything as good.

The API returns no undertone and no confidence value. Anything about warmth is our own estimate from the hue of the measured colour and is labelled as an estimate.

## Colour difference

Both colours are converted to CIELAB (D65) and compared with CIEDE2000. The implementation is checked against the published Sharma test pairs and against scikit-image. About 1 unit is the smallest step a careful observer can see.

## Verdict cut-offs (provisional, in `src/config/verdict.ts`)

| Colour difference | Verdict |
| --- | --- |
| up to 3.5 | good match |
| above 3.5, up to 7.0 | close match |
| above 7.0 | poor match |

These are deliberately looser than laboratory thresholds. The skin colour is a camera estimate and the swatch is a digital approximation of a physical shade. In our own check, a 4-point lightness error in the photo alone moved the colour difference by about 3 units. We do not claim to separate shades more finely than that.

## When it says "can't tell, retake"

- The capture-quality score is below 0.60 (the same minimum the on-device check uses).
- The skin colour is missing or not a valid colour.

It never guesses in these cases. A shade with missing colour data is reported as unreadable, without asking for a retake.

## Confidence

1. Start from the quality score: 0.90 or more is high, 0.70 or more is medium, below that is low.
2. Drop one level if the analysis service did not confirm the photo quality.
3. Drop one level if the colour difference is within 0.5 of a cut-off, because a small lighting change could flip the verdict.

Confidence never goes below low and never exceeds what the quality score allows.

## Reasons

Each verdict lists reasons from a fixed set of templates: the match grade with its colour difference, lighter or darker (from 3 lightness points), warmer or cooler (from 4 degrees of hue, estimated), the quality score when it limits confidence, the service's quality note, and a warning when near a cut-off. Tests check that every number in every sentence comes from the computed values, the quality score or the configuration.

## Comparing shades

- Shades are ranked by colour difference.
- Shades within 0.5 of the best one, with the same verdict, are reported as a tie, the cheaper one is listed first, and the price difference in rupees is stated.
- A tie is never claimed between different verdicts, even when the numbers are close.
- "Buy" is the closest shade or tied shades. "Consider" is another good match, or a close match that costs less. Everything else is "skip". If no shade is a good or close match, nothing is recommended.
- Trade-offs are stated plainly, for example that a cheaper shade is a close match rather than a good one.
- The comparison's confidence is the lowest confidence among the shades.

## Limits

- The measured colour depends on the lighting and camera of the photo. Verdicts are cosmetic guidance, not a guarantee.
- The cut-offs and the demo catalogue are provisional and have not been tested against real foundation purchases.
- Fairness checks so far cover the capture gate. The verdict maths is tone-neutral by construction (a perceptual colour difference, tested at light, medium and deep values), but it has not been evaluated on real photos across skin tones.
