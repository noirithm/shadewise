# Privacy and limitations

This describes what ShadeWise actually does with a face photo, in plain language. It is not legal advice and makes no claim about compliance with any data-protection law.

## What happens to a photo, step by step

1. **Consent first.** Before the camera or an upload, the widget says what is captured, what is sent, that we do not store the photo, how to delete, and that results are cosmetic guidance. Consent is remembered for the browser tab only, as a version number and a time. It never includes a photo.
2. **On the device.** The photo is redrawn to a JPEG of at most 1000 pixels on its longer side. This also drops camera metadata such as location. A free quality check runs in the browser with a face model that we host ourselves. **Nothing is sent for this step.** A photo that fails it never leaves the device.
3. **Sent only if it passes.** The photo goes to our server over HTTPS with a random session id (no cookies, no account).
4. **Our server.** It checks the file by its content, size and dimensions, keeps the photo in memory only while the request runs, and forwards it to the YouCam API (Perfect Corp.): it registers the file, uploads it to YouCam's storage through a one-time address, and creates a skin tone task and, if needed, a try-on task.
5. **The result.** The server returns the measured skin colour, a photo-quality note and a preview image address. The verdict is computed in the browser. The photo is dropped from server memory when the request ends.

## What is kept, where, and for how long

| Item | Where | How long |
| --- | --- | --- |
| The photo | The shopper's browser memory | Until retake, close, delete or leaving the page |
| The photo | Our server | In memory during one request only. Never written to disk or logs |
| The photo | YouCam API storage (US region host) | Up to 30 days, according to its documentation. We found no delete function, so **we cannot remove this copy** |
| AI preview image | YouCam storage | Its address is time-limited (the documentation says 2 hours) |
| Measurement cache | Our server memory | About 20 minutes. Holds the YouCam file id, the measured skin colour and preview addresses. No image |
| Consent record | The browser tab (session storage) | Until the tab closes |
| Anonymous counters | Our server memory, one instance | Until the server restarts. Fixed words and a random session id. No photo, name or address |
| Network address | Our server memory, briefly | Only for rate limiting, for at most 10 minutes. Not written to our logs or counters |
| Logs | Our structured logs | Never contain images, keys or personal details. This is checked by tests |
| Hosting provider logs | The hosting provider | The provider keeps its own standard request logs |

## "Delete my data"

The button clears the consent record and the photo held in the browser, and resets the widget. It cannot delete the copy held by the YouCam API. The consent screen says so before the shopper starts.

## What it does not do

- It does not infer or show ethnicity, age, gender or health conditions from a face.
- It is not a skin-score or diagnosis tool. The only skin measurement used is one average colour.
- Warmer or cooler comments are an estimate from the hue of that colour, labelled as an estimate. The YouCam API does not return an undertone.
- It does not use cookies, accounts or advertising trackers, and makes no sales or return-rate claims.

## Limitations

- **Camera and light.** The measured colour depends on the lighting and camera of the photo. A bad photo can be refused; a mediocre one can still give a wrong answer, which is why confidence and "can't tell" exist.
- **Swatch versus real product.** A catalogue colour is a digital approximation of a physical shade. The verdict cut-offs are deliberately loose for that reason.
- **Provisional settings.** Quality thresholds and verdict cut-offs were set from a small number of photos and are provisional.
- **The AI preview** is illustrative and can be subtle. It never changes the verdict.
- **Small test group.** See [FAIRNESS_AND_TESTING.md](FAIRNESS_AND_TESTING.md).
- **Budget.** Live analysis uses a small pool of API credits. After a limit is reached the widget offers a recorded sample, which is a real earlier result on an AI-generated face and is labelled as such.
- **Counters** reset when the server restarts and are not a historical record.
- **The demo catalogue** is made up. Brand, products and prices are not real.

## Not medical advice

Results are cosmetic guidance about shade matching. They are not a medical assessment, and should not be used to judge skin health.
