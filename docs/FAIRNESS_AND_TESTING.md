# Fairness and testing

## The risk

The free on-device check decides whether a photo is good enough to send for analysis. If it refused people with deeper skin tones more often, for example by calling a well-lit deep-skinned face "too dark", it would be unfair, and the product would work worse for them.

## How the checks were designed not to depend on skin tone

- **Brightness** is judged on the whole frame, not on the face. A properly lit deep skin tone has a low absolute brightness, so the face alone cannot tell "deep skin in good light" from "light skin in dim light". Only a near-black floor applies to the face.
- **Shadows** are measured relative to the face's own median brightness.
- **Evenness** compares the left and right sides of the face as a ratio.
- **Blur** is measured on the eye region as ratios (edge crispness relative to local contrast, and the direction of edge loss), so a low-contrast face is not scored as blurrier.
- **The verdict** uses a perceptual colour difference (CIEDE2000), and the engine's tests use light, medium and deep skin colours as numbers, including the same small offsets giving the same verdict for all three.

## What was tested

| Test | Result |
| --- | --- |
| Unit tests for the quality checks with light, medium and deep tones, including identical conditions giving identical results and a dark scene being refused for every tone | Pass |
| Verdict engine with light, medium and deep colour fixtures, boundaries, ties, missing and garbage inputs | Pass |
| Logic test on 21 **AI-generated** faces (light, medium and deep; 3 good and 4 deliberately bad photos each) | 9 of 9 good photos passed and 12 of 12 bad photos were refused, at every tone group |
| Real webcam photos of one team member in different light and distances | Used to calibrate thresholds. This is how the blur and brightness rules were corrected |

The AI-generated faces test the logic only. They are **not** evidence about real people and are excluded from the fairness report by design.

## What was not done, honestly

- **Testing with several real people across skin tones, devices and lighting is limited.** Thresholds were set from about a dozen photos: AI-generated faces and webcam shots of one team member. A broader test is the most important next step.
- A deep-skinned person in a bright room, wearing dark clothes against a dark wall, could make the whole frame look dark and be wrongly asked for more light. This has been identified but not tested with real people. If it happens, the planned fallback is to rely on the YouCam API's own lighting flag.
- No low-end Android phone or throttled-network test has been recorded.

## How to run the real-people test

1. Open `/fairness.html` on the device being tested (it is a tester tool, not linked from the shop, and it never calls the paid API or stores a photo).
2. The tester chooses their own skin tone group, the lighting and the device, takes about 3 good photos and 4 deliberately bad ones, and saves each result.
3. Download the CSV, put it in `fairness/`, and run `npm run fairness:report`. It writes `docs/FAIRNESS_RESULTS.md` with the pass rates by group, flags any gap above 15 points, and says "not enough data" for any group with fewer than 5 photos.

Fixing a disparity means changing a threshold and re-running the tests.

## Other tests

Unit and contract tests, error-state tests with a stubbed YouCam API, the spend guard and refund rules, and a browser check of every shop page under the security policy (no violations, no sideways scrolling at phone width). The face engine was also loaded in a real browser under the policy, which found and fixed a blocking rule before release.
