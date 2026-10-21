import { describe, expect, it } from "vitest";
import { YouCamError, createYouCamClient, errorCodeOf, photoTip } from "@/server/youcam";
import { TIPS } from "@/widget/gate/tips";
import tone from "./fixtures/skin-tone-success.json";
import vto from "./fixtures/makeup-vto-success.json";

const KEY = "test-key-abcdef123456";
const BASE = "https://api.example.test";

type Handler = (url: string, init: RequestInit) => Response | Promise<Response> | Error;

function scripted(handlers: Handler[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    const h = handlers[i++];
    if (!h) throw new Error("unexpected extra request: " + String(input));
    const r = await h(String(input), init);
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
  return { fn, calls };
}

function clock() {
  let t = 0;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

function setup(handlers: Handler[]) {
  const s = scripted(handlers);
  const c = clock();
  const client = createYouCamClient({ apiKey: KEY, apiBase: BASE, fetch: s.fn, sleep: c.sleep, now: c.now });
  return { client, calls: s.calls, clock: c };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const created = () => json({ status: 200, data: { task_id: "t1" } });
const running = () => json({ status: 200, data: { task_status: "running" } });
const errBody = (code: unknown) => json({ status: 200, data: { task_status: "error", error: code } });

async function fail(p: Promise<unknown>): Promise<YouCamError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(YouCamError);
    const err = e as YouCamError;
    expect(`${err.message} ${JSON.stringify(err.opts)}`).not.toContain(KEY);
    return err;
  }
  throw new Error("expected a YouCamError");
}

describe("getBalance", () => {
  it("reads the balance from the real response shape and sends the key only as a bearer token", async () => {
    const { client, calls } = setup([
      () => json({ status: 200, results: [{ amount: 979, expiry: 4102444800000 }, { amount: 40, expiry: 4102444800000 }] }),
    ]);
    expect(await client.getBalance()).toBe(1019);
    expect(calls[0].url).toBe(`${BASE}/s2s/v1.0/client/credit`);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
  });
  it("reports an unrecognised balance shape instead of guessing", async () => {
    const { client } = setup([() => json({ status: 200, nope: true })]);
    expect((await fail(client.getBalance())).kind).toBe("bad_response");
  });
});

describe("uploadImage", () => {
  const reg = () =>
    json({
      status: 200,
      data: { files: [{ file_id: "f-123", requests: [{ method: "PUT", url: "https://upload.example.test/x?sig=1" }] }] },
    });

  it("registers the file, then uploads the bytes without the API key", async () => {
    const { client, calls } = setup([reg, () => new Response(null, { status: 200 })]);
    expect(await client.uploadImage(new Uint8Array([1, 2, 3, 4]), "image/jpeg")).toBe("f-123");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      files: [{ content_type: "image/jpeg", file_name: "photo.jpg", file_size: 4 }],
    });
    expect(calls[1].url).toBe("https://upload.example.test/x?sig=1");
    expect(calls[1].init.method).toBe("PUT");
    expect(JSON.stringify(calls[1].init.headers ?? {})).not.toContain(KEY);
  });
  it("fails clearly when storage refuses the upload", async () => {
    const { client } = setup([reg, () => new Response(null, { status: 403 })]);
    const e = await fail(client.uploadImage(new Uint8Array([1]), "image/jpeg"));
    expect(e.kind).toBe("upload_failed");
    expect(e.maybeCharged).toBe(false);
  });
  it("fails clearly when the upload cannot connect", async () => {
    const { client } = setup([reg, () => new Error("connect ECONNRESET")]);
    expect((await fail(client.uploadImage(new Uint8Array([1]), "image/jpeg"))).kind).toBe("upload_failed");
  });
  it("treats a registration outage as unavailable", async () => {
    const { client } = setup([() => json({}, 503)]);
    expect((await fail(client.uploadImage(new Uint8Array([1]), "image/jpeg"))).kind).toBe("unavailable");
  });
  it("refuses an upload address that is not https", async () => {
    const bad = () => json({ status: 200, data: { files: [{ file_id: "f", requests: [{ url: "http://insecure.example.test/x" }] }] } });
    const { client } = setup([bad]);
    expect((await fail(client.uploadImage(new Uint8Array([1]), "image/jpeg"))).kind).toBe("bad_response");
  });
});

describe("analyzeSkinTone", () => {
  it("creates the task, polls with backoff, and normalises the real response shape", async () => {
    const { client, calls, clock: c } = setup([created, running, running, () => json(tone)]);
    const m = await client.analyzeSkinTone("f-123");
    expect(m.skinHex).toBe("#b48868");
    expect(m.allGood).toBe(true);
    expect(calls[0].url).toBe(`${BASE}/s2s/v2.0/task/skin-tone-analysis`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ src_file_id: "f-123" });
    expect(calls[1].url).toBe(`${BASE}/s2s/v2.0/task/skin-tone-analysis/t1`);
    expect(c.sleeps).toEqual([1000, 1500, 2250]);
  });

  it("caps the polling delay", async () => {
    const handlers = [created, ...Array.from({ length: 8 }, () => running), () => json(tone)];
    const { client, clock: c } = setup(handlers);
    await client.analyzeSkinTone("f");
    expect(Math.max(...c.sleeps)).toBe(4000);
    expect(c.sleeps.slice(0, 4)).toEqual([1000, 1500, 2250, 3375]);
  });

  it("turns a documented face error into a shopper tip and says nothing was charged", async () => {
    const { client } = setup([created, () => errBody("error_face_position_too_small")]);
    const e = await fail(client.analyzeSkinTone("f"));
    expect(e.kind).toBe("photo_rejected");
    expect(e.tip).toBe(TIPS.tooFar);
    expect(e.maybeCharged).toBe(false);
  });
  it("understands an error given as an object", async () => {
    const { client } = setup([created, () => errBody({ code: "error_face_angle_leftward" })]);
    expect((await fail(client.analyzeSkinTone("f"))).tip).toBe(TIPS.yaw);
  });
  it("reports an unknown task error as a failed task, not charged", async () => {
    const { client } = setup([created, () => errBody("error_something_new")]);
    const e = await fail(client.analyzeSkinTone("f"));
    expect(e.kind).toBe("task_failed");
    expect(e.tip).toBeUndefined();
    expect(e.maybeCharged).toBe(false);
  });

  it("gives up at the timeout, and says units may have been spent", async () => {
    const { client } = setup([created, ...Array.from({ length: 60 }, () => running)]);
    const e = await fail(client.analyzeSkinTone("f", { timeoutMs: 10_000 }));
    expect(e.kind).toBe("timeout");
    expect(e.maybeCharged).toBe(true);
  });

  it("reports a rate limit on creating the task as not charged", async () => {
    const { client } = setup([() => json({}, 429)]);
    const e = await fail(client.analyzeSkinTone("f"));
    expect(e.kind).toBe("rate_limited");
    expect(e.maybeCharged).toBe(false);
  });
  it("gives up after repeated rate limits while polling", async () => {
    const { client } = setup([created, () => json({}, 429), () => json({}, 429), () => json({}, 429)]);
    const e = await fail(client.analyzeSkinTone("f"));
    expect(e.kind).toBe("rate_limited");
    expect(e.maybeCharged).toBe(true);
  });
  it("survives one temporary outage while polling", async () => {
    const { client } = setup([created, () => json({}, 503), () => json(tone)]);
    expect((await client.analyzeSkinTone("f")).skinHex).toBe("#b48868");
  });
  it("reports rejected credentials without leaking the key", async () => {
    const { client } = setup([() => json({}, 401)]);
    expect((await fail(client.analyzeSkinTone("f"))).kind).toBe("auth");
  });
  it("reports a network failure as unavailable, without the low-level message", async () => {
    const { client } = setup([() => new Error("connect ECONNREFUSED 10.0.0.1:443")]);
    const e = await fail(client.analyzeSkinTone("f"));
    expect(e.kind).toBe("unavailable");
    expect(e.message).not.toContain("10.0.0.1");
  });
  it("loudly reports a result in an unexpected shape, as possibly charged", async () => {
    const bad = () => json({ status: 200, data: { task_status: "success", results: { color: { skin_color: "brown" } } } });
    const { client } = setup([created, bad]);
    const e = await fail(client.analyzeSkinTone("f"));
    expect(e.kind).toBe("bad_response");
    expect(e.maybeCharged).toBe(true);
  });
  it("reports a task response without a task id, not charged", async () => {
    const { client } = setup([() => json({ status: 200, data: {} })]);
    const e = await fail(client.analyzeSkinTone("f"));
    expect(e.kind).toBe("bad_response");
    expect(e.maybeCharged).toBe(false);
  });
});

describe("tryOn", () => {
  it("sends the foundation effect with smoothing off and returns the preview url", async () => {
    const { client, calls } = setup([created, () => json(vto)]);
    const r = await client.tryOn("f-123", "#B88F76");
    expect(r.imageUrl).toContain("example.invalid");
    expect(calls[0].url).toBe(`${BASE}/s2s/v2.0/task/makeup-vto`);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.src_file_id).toBe("f-123");
    expect(body.version).toBe("1.0");
    expect(body.effects).toEqual([
      { category: "skin_smooth", skinSmoothStrength: 0, skinSmoothColorIntensity: 0 },
      { category: "foundation", palettes: [{ color: "#B88F76", colorIntensity: 60, glowIntensity: 30, coverageIntensity: 50 }] },
    ]);
  });
  it("refuses an invalid shade colour before making any request", async () => {
    const { client, calls } = setup([]);
    const e = await fail(client.tryOn("f", "brown"));
    expect(e.kind).toBe("bad_request");
    expect(calls).toHaveLength(0);
  });
  it("rejects the array result shape from the docs, which the real API did not use", async () => {
    const arr = () => json({ status: 200, data: { task_status: "success", results: [{ download_url: "x" }] } });
    const { client } = setup([created, arr]);
    expect((await fail(client.tryOn("f", "#B88F76"))).kind).toBe("bad_response");
  });
});

describe("error helpers", () => {
  it("maps documented face codes to the same tips the widget shows", () => {
    expect(photoTip("error_face_position_too_small")).toBe(TIPS.tooFar);
    expect(photoTip("error_face_position_out_of_boundary")).toBe(TIPS.cropped);
    expect(photoTip("error_face_position_invalid")).toBe(TIPS.noFace);
    expect(photoTip("error_face_angle_upward")).toBe(TIPS.pitch);
    expect(photoTip("error_face_angle_right_tilt")).toBe(TIPS.roll);
    expect(photoTip("error_face_not_forward_facing")).toBe(TIPS.yaw);
    expect(photoTip("error_face_angle_invalid")).toBe(TIPS.yaw);
    expect(photoTip("error_below_min_image_size")).toBe(TIPS.smallPhoto);
    expect(photoTip("error_unknown_thing")).toBeUndefined();
  });
  it("reads an error code from the likely places and cleans it", () => {
    expect(errorCodeOf({ data: { error: "Error_Face_Position_Invalid" } })).toBe("error_face_position_invalid");
    expect(errorCodeOf({ error_code: "exceed_limit" })).toBe("exceed_limit");
    expect(errorCodeOf({ error: { code: "x y!z" } })).toBe("xyz");
    expect(errorCodeOf({ data: { error: null } })).toBeUndefined();
    expect(errorCodeOf(null)).toBeUndefined();
  });
});
