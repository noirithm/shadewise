# Fairness and testing

_Generated 2026-10-17 from 0 recorded results (0 excluded: no skin tone group given)._

## What was tested

The free on-device capture gate decides whether a photo is good enough to send for analysis. It must not refuse people with deeper skin tones more often than people with lighter skin, so we measure it.

- **Testers:** real people who agreed to be tested. They chose their own skin tone group (light, medium or deep). The app never guesses skin tone from a face.
- **Photos taken:** each tester took photos meant to be good, and photos made bad on purpose (too dark, blurry, turned away, too far, uneven light).
- **What is stored:** only the gate's numbers and verdict plus the tester's own choices. No photos are saved anywhere.
- **Rule:** a gap of more than 15 percentage points between groups is flagged. A group with fewer than 5 photos is reported as "not enough data", not as a result.

## Results

### Good photos (lower is better)

| Skin tone group | Photos | Passed the gate | Wrongly refused |
| --- | --- | --- | --- |
| light | 0 | 0 | n/a |
| medium | 0 | 0 | n/a |
| deep | 0 | 0 | n/a |

### Bad photos made on purpose (lower is better)

| Skin tone group | Photos | Passed the gate | Wrongly passed |
| --- | --- | --- | --- |
| light | 0 | 0 | n/a |
| medium | 0 | 0 | n/a |
| deep | 0 | 0 | n/a |

### Why good photos were refused

- light: none
- medium: none
- deep: none

## Flags

- Not enough good photos for light skin (0 of 5 needed).
- Not enough good photos for medium skin (0 of 5 needed).
- Not enough good photos for deep skin (0 of 5 needed).
- Not enough bad photos for light skin (0 of 5 needed).
- Not enough bad photos for medium skin (0 of 5 needed).
- Not enough bad photos for deep skin (0 of 5 needed).

## Limitations

- Small numbers: a handful of testers cannot represent everyone, and three skin tone groups are a coarse split.
- Skin tone group is the tester's own choice, so groups are not exactly comparable between people.
- Thresholds in the gate are provisional until a flag-free run with enough photos per group.
- Devices and lighting vary between testers, which adds noise.
- Fixing a disparity means changing a threshold, and the tests run again afterwards.
