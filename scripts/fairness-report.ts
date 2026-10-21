import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { MAX_GAP, MIN_N, TONES, errorRate, parseCsv, summarize } from "../src/shared/fairness";

const dir = "fairness";
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".csv")) : [];
if (!files.length) {
  console.error("No CSV files in fairness/. Download records from /fairness.html and move them there.");
  process.exit(1);
}
const records = files.flatMap((f) => parseCsv(readFileSync(`${dir}/${f}`, "utf8")));
const s = summarize(records);
const pct = (x: number | null) => (x === null ? "n/a" : `${Math.round(x * 100)}%`);

const table = (intent: "good" | "bad") =>
  [
    "| Skin tone group | Photos | Passed the gate | " + (intent === "good" ? "Wrongly refused" : "Wrongly passed") + " |",
    "| --- | --- | --- | --- |",
    ...TONES.map((t) => {
      const r = s.rows.find((x) => x.tone === t && x.intent === intent)!;
      return `| ${t} | ${r.n} | ${r.passed} | ${pct(errorRate(r))} |`;
    }),
  ].join("\n");

const reasonLines = TONES.map((t) => {
  const entries = Object.entries(s.reasons[t]).sort((a, b) => b[1] - a[1]);
  return `- ${t}: ${entries.length ? entries.map(([id, n]) => `${id} (${n})`).join(", ") : "none"}`;
}).join("\n");

const md = `# Fairness and testing

_Generated ${new Date().toISOString().slice(0, 10)} from ${records.length} recorded results (${s.excluded} excluded: no skin tone group given)._

## What was tested

The free on-device capture gate decides whether a photo is good enough to send for analysis. It must not refuse people with deeper skin tones more often than people with lighter skin, so we measure it.

- **Testers:** real people who agreed to be tested. They chose their own skin tone group (light, medium or deep). The app never guesses skin tone from a face.
- **Photos taken:** each tester took photos meant to be good, and photos made bad on purpose (too dark, blurry, turned away, too far, uneven light).
- **What is stored:** only the gate's numbers and verdict plus the tester's own choices. No photos are saved anywhere.
- **Rule:** a gap of more than ${Math.round(MAX_GAP * 100)} percentage points between groups is flagged. A group with fewer than ${MIN_N} photos is reported as "not enough data", not as a result.

## Results

### Good photos (lower is better)

${table("good")}

### Bad photos made on purpose (lower is better)

${table("bad")}

### Why good photos were refused

${reasonLines}

## Flags

${s.flags.length ? s.flags.map((f) => `- ${f}`).join("\n") : "- None."}

## Limitations

- Small numbers: a handful of testers cannot represent everyone, and three skin tone groups are a coarse split.
- Skin tone group is the tester's own choice, so groups are not exactly comparable between people.
- Thresholds in the gate are provisional until a flag-free run with enough photos per group.
- Devices and lighting vary between testers, which adds noise.
- Fixing a disparity means changing a threshold, and the tests run again afterwards.
`;
writeFileSync("docs/FAIRNESS_AND_TESTING.md", md);
console.log(`Wrote docs/FAIRNESS_AND_TESTING.md from ${records.length} results.`);
console.log(s.flags.length ? "\nFlags:\n- " + s.flags.join("\n- ") : "\nNo flags.");
