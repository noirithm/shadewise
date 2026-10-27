// Records ONE real API run on a photo, plus a foundation preview for every demo shade, as the
// "recorded sample". Dry run by default; pass --yes to spend units.
//   npm run sample:record -- photos/test1.jpg --yes
// Only the preview renders are saved, never the source photo. Review them before committing.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { CAPS, COSTS } from "../src/config/caps";
import { CATALOGUE } from "../src/config/catalogue";
import { loadServerConfig } from "../src/server/config";
import { validateUpload } from "../src/server/upload";
import { YouCamError, createYouCamClient } from "../src/server/youcam";
import { sniffImageType } from "../src/widget/imageCheck";
import { parseSample } from "../src/widget/sample";

try {
  (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile?.(".env");
} catch {
  /* no .env file: rely on the environment */
}

const args = process.argv.slice(2);
const photoPath = args.find((a) => !a.startsWith("--")) ?? "photos/test1.jpg";
const yes = args.includes("--yes");
const subject =
  args.find((a) => a.startsWith("--subject="))?.slice("--subject=".length) ?? "AI-generated example face, not a real person";
const OUT = "public/samples";
const cost = COSTS.skinTone + CATALOGUE.length * COSTS.tryOn;

const say = (s: string) => console.log(s);
const why = (e: unknown) => (e instanceof YouCamError ? `${e.kind}: ${e.message}` : e instanceof Error ? e.message : "unexpected error");

async function download(url: string): Promise<{ bytes: Uint8Array; ext: "jpg" | "png" }> {
  if (new URL(url).protocol !== "https:") throw new Error("the preview address was not https");
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new Error("the preview download failed (network)");
  }
  if (!res.ok) throw new Error(`the preview download failed (HTTP ${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > 3 * 1024 * 1024) throw new Error("the preview is larger than 3 MB");
  const type = sniffImageType(bytes);
  if (!type) throw new Error("the preview is not a jpg or png");
  return { bytes, ext: type === "image/png" ? "png" : "jpg" };
}

async function main() {
  const bytes = new Uint8Array(await readFile(photoPath));
  const check = validateUpload(bytes);
  if (!check.ok) throw new Error(`the photo is not usable (${check.problem})`);

  say(`Photo: ${photoPath} (${check.width}x${check.height})`);
  say(`Subject label: ${subject}`);
  say(`Plan: 1 skin tone analysis (${COSTS.skinTone} units) + ${CATALOGUE.length} previews (${CATALOGUE.length * COSTS.tryOn} units) = ${cost} units`);
  if (!yes) {
    say("\nDry run. Nothing was sent or spent. Add --yes to record.");
    return;
  }

  const cfg = loadServerConfig();
  const client = createYouCamClient({ apiKey: cfg.apiKey, apiBase: cfg.apiBase });
  const before = await client.getBalance();
  say(`\nBalance before: ${before}`);
  if (before - cost < CAPS.reserveUnits) {
    throw new Error(`this would drop the balance below the ${CAPS.reserveUnits}-unit reserve, so it was not started`);
  }

  const fileId = await client.uploadImage(bytes, check.type);
  const tone = await client.analyzeSkinTone(fileId);
  say(`Skin colour measured: ${tone.skinHex} (face quality all good: ${tone.allGood})`);

  await mkdir(OUT, { recursive: true });
  const previews: { id: string; hex: string; file: string }[] = [];
  for (const p of CATALOGUE) {
    try {
      const r = await client.tryOn(fileId, p.hex);
      const img = await download(r.imageUrl);
      const file = `${p.id}.${img.ext}`;
      await writeFile(`${OUT}/${file}`, img.bytes);
      previews.push({ id: p.id, hex: p.hex, file });
      say(`  preview ${p.id} (${p.shade}): saved ${file}`);
    } catch (e) {
      say(`  preview ${p.id} (${p.shade}): FAILED (${why(e)})`);
    }
  }

  const sample = {
    version: 1,
    recordedAt: new Date().toISOString(),
    subject,
    tone: { skinHex: tone.skinHex, allGood: tone.allGood },
    previews,
  };
  if (!parseSample(sample)) throw new Error("the recorded sample failed its own validation, so it was not written");
  await writeFile(`${OUT}/samples.json`, JSON.stringify(sample, null, 2) + "\n");

  const after = await client.getBalance();
  say(`\nWrote ${OUT}/samples.json with ${previews.length} of ${CATALOGUE.length} previews.`);
  say(`Balance after: ${after} (spent ${before - after}).`);
  say("Open the saved images and check them before committing.");
}

main().catch((e) => {
  console.error("\nStopped:", why(e));
  process.exit(1);
});
