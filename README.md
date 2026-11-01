# ShadeWise

**Know if a shade will suit you before you buy it.**

ShadeWise is a widget any beauty brand can add to a product page with one script tag. The shopper takes one selfie. The widget checks the photo on the device, measures skin tone, shows a foundation preview, and returns a clear verdict (good match, close match, poor match, or can't tell) with a confidence level and the reasons. If the photo isn't good enough to trust, it says so before any paid analysis and explains how to retake it.

Built for the YouCam API Skin AI & eCommerce VTO Hackathon with the YouCam API by Perfect Corp.

**Live demo (no login, no key):** https://shadewise-lac.vercel.app
[Embed docs](https://shadewise-lac.vercel.app/embed) · [Merchant dashboard](https://shadewise-lac.vercel.app/dashboard)

> Cosmetic guidance only, not medical advice. The shop, brand, products and prices in the demo are made up ("demo catalogue").

## What it does

1. The shopper agrees to a plain-language consent screen, then takes a selfie or uploads a photo.
2. A **free check on the device** looks at the photo: one face, size, head angle, lighting, shadows, evenness, blur, colour cast. A bad photo is refused with a specific fix and never leaves the device.
3. A good photo is sent to the server, which uses the **YouCam API**: skin tone analysis and a foundation try-on preview.
4. A **deterministic, tested engine** compares the measured skin colour with the shade (CIEDE2000) and explains the result with templated sentences, a confidence level, and a clear "can't tell, retake" when it isn't sure.
5. Two or three shades can be compared, ranked with Buy / Consider / Skip and rupee trade-offs.
6. A merchant dashboard shows aggregate, photo-free numbers: verdicts, why photos were refused, retake-then-success, and units per session.

## YouCam APIs used

| API | Endpoint | Measured cost |
| --- | --- | --- |
| AI Facial Color Tones Analyzer | `POST /s2s/v2.0/task/skin-tone-analysis` | 20 units |
| AI Makeup Virtual Try-On (foundation effect) | `POST /s2s/v2.0/task/makeup-vto` | 1 unit |

Both are verified by real calls; details and surprises are in [docs/API_NOTES.md](docs/API_NOTES.md).

## What is built, and how it is protected

- **Spend control:** nothing paid is called until the free check passes; the real account balance is read before every paid call; 250 units are kept in reserve; a session can spend at most 23 units; repeats of the same photo are served from a short in-memory cache. When live checks are unavailable, the widget offers a clearly labelled **recorded sample** (a real recorded API result on an AI-generated example face).
- **Privacy:** consent first; the photo is shrunk and stripped of metadata on the device; our server never stores it; logs never contain images or keys. The YouCam API keeps uploads for up to 30 days per its documentation. See [docs/PRIVACY_AND_LIMITATIONS.md](docs/PRIVACY_AND_LIMITATIONS.md).
- **Fairness:** checks are designed not to depend on skin tone (brightness is judged on the whole frame, shadows and blur are ratios). See [docs/FAIRNESS_AND_TESTING.md](docs/FAIRNESS_AND_TESTING.md) for what was and was not tested.
- **Security:** API key on the server only; uploads checked by content; rate limits per address and per session; CORS allowlist; content security policy and other headers; schema validation at every boundary.
- **Accessibility:** keyboard operation, visible focus, screen-reader announcements, reduced-motion support, 44-pixel touch targets, results never shown by colour alone.

## Run it yourself

Requires Node 24.

```bash
git clone https://github.com/noirithm/shadewise.git
cd shadewise
cp .env.example .env     # add your own YouCam API key
npm install
npm run dev              # downloads the face model and builds the widget first
```

Open http://localhost:3000. The camera works on `localhost` and on HTTPS.

| Variable | Description |
| --- | --- |
| `YOUCAM_API_KEY` | Your YouCam API key. Server only. Never committed. |
| `YOUCAM_API_BASE` | API base address. Default `https://yce-api-01.makeupar.com` |
| `ALLOWED_ORIGINS` | Optional. Comma-separated sites allowed to embed the widget and call this server. Empty means this site only. |
| `CSP_REPORT_ONLY` | Optional. `1` makes the content security policy report instead of block. |

## Tests

```bash
npm test                 # unit and contract tests
npm run lint
npx tsc --noEmit
npm run build
```

Tests cover the capture-quality checks, the colour-difference maths (against published reference values), the verdict engine, the comparison ranking, response normalisation for the YouCam API, the spend guard and refunds, upload validation, rate limiting, CORS, HTML escaping of untrusted catalogue text, and the security headers. YouCam API calls are tested with a stubbed API.

## Deploy

Vercel: import the repository, set the Build Command to `npm run build`, and set `YOUCAM_API_KEY` (and `YOUCAM_API_BASE`) for Production. The build downloads the face model and builds the widget.

## Docs

- [API notes](docs/API_NOTES.md): what the YouCam API really returns, with costs
- [How the verdict works](docs/VERDICT_LOGIC.md)
- [Privacy and limitations](docs/PRIVACY_AND_LIMITATIONS.md)
- [Fairness and testing](docs/FAIRNESS_AND_TESTING.md)
- [Demo video script](docs/DEMO.md) and [Devpost text](docs/DEVPOST.md)

## Known limitations

- Verdict cut-offs and quality thresholds are provisional, set from a small number of photos.
- Fairness testing across real people is limited (see the fairness document).
- The skin colour is a camera estimate and the swatch a digital approximation, so the result is guidance, not a promise.
- The AI preview is illustrative and can be subtle; the verdict comes from the numbers.
- The unit budget is small, so after it is used live checks fall back to the recorded sample.
- Merchant counters live in one server's memory and reset when it restarts.

## Licence

MIT. See [LICENSE](LICENSE).
