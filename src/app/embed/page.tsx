import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { StoreShell } from "../_components/StoreShell";
import { Widget } from "../_components/Widget";

export const metadata: Metadata = {
  title: "Add ShadeWise to your store in 60 seconds",
  description: "The embed snippet, the attributes, theming, and exactly what the widget sends.",
};

const SNIPPET = `<script type="module" src="https://YOUR-SHADEWISE-HOST/widget/index.js"></script>

<shadewise-widget
  product-id="demo-05"
  catalogue-src="https://YOUR-SHADEWISE-HOST/api/catalogue"
  compare="demo-04,demo-10">
</shadewise-widget>`;

const THEME = `<shadewise-widget
  product-id="demo-05"
  style="--sw-accent:#6d28d9; --sw-border:#c4b5fd; --sw-bg:#faf5ff; --sw-text:#2e1065">
</shadewise-widget>`;

const ATTRS: [string, string, string][] = [
  ["product-id", "Yes", "The id of the product on this page. It is looked up in the catalogue; if it is not there, the widget uses swatch instead."],
  ["catalogue-src", "Recommended", "A web address that returns your shades as JSON. Relative addresses are read from the ShadeWise host, not your page. Without it, only the main shade is judged."],
  ["compare", "No", "Up to two more product ids from the catalogue to rank against this one, separated by commas."],
  ["swatch", "No", "A fallback shade colour such as #b88f76, used only when the product is not in the catalogue."],
];

const CATALOGUE_SHAPE = `{ "items": [
  { "id": "demo-05", "name": "Skin Tint Foundation", "shade": "Caramel 05",
    "hex": "#A57656", "priceInr": 999 }
] }`;

const SENT: string[] = [
  "One photo: a JPEG, shrunk on the shopper's device to at most 1000 pixels on its longer side, with camera metadata removed. It is sent only after the shopper agrees and the on-device quality check passes.",
  "A random session id (not tied to a person, with no cookies or accounts) and the shade colour of the main product.",
  "Our server forwards the photo to the YouCam API (Perfect Corp.) to measure skin tone and render an AI preview. We do not store the photo. The YouCam API keeps uploaded files for up to 30 days, according to its documentation, and we cannot delete that copy.",
  "The shopper's consent is remembered for the browser tab only, as a version number and a time, and never with a photo.",
];

export default function EmbedPage() {
  const purple = { "--sw-accent": "#6d28d9", "--sw-border": "#c4b5fd", "--sw-bg": "#faf5ff", "--sw-text": "#2e1065" } as CSSProperties;
  return (
    <StoreShell>
      <h1 style={{ marginTop: 0 }}>Add ShadeWise to your store in 60 seconds</h1>
      <p>
        ShadeWise is one script tag and one element. The shopper takes a selfie, the widget measures skin tone, and it returns a verdict with the
        reasons: good match, close match, poor match, or can&apos;t tell, retake.
      </p>

      <h2>1. Paste this on a product page</h2>
      <pre className="code">
        <code>{SNIPPET}</code>
      </pre>
      <p className="small">
        Replace <code>YOUR-SHADEWISE-HOST</code> with the address where ShadeWise is deployed. The widget finds its own files from the script&apos;s
        address. If your store is on a different site than ShadeWise, that site&apos;s address must be on the server&apos;s allowed-origins list.
      </p>

      <h2>2. Attributes</h2>
      <div className="scroll" role="region" aria-label="Attributes table" tabIndex={0}>
        <table>
          <caption className="small" style={{ textAlign: "left", paddingBottom: ".5rem" }}>
            Attributes of the shadewise-widget element
          </caption>
          <thead>
            <tr>
              <th scope="col">Attribute</th>
              <th scope="col">Needed</th>
              <th scope="col">What it does</th>
            </tr>
          </thead>
          <tbody>
            {ATTRS.map(([name, needed, what]) => (
              <tr key={name}>
                <th scope="row">
                  <code>{name}</code>
                </th>
                <td>{needed}</td>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>The catalogue address returns this shape. Prices are whole rupees. Entries with a bad id, colour or price are ignored.</p>
      <pre className="code">
        <code>{CATALOGUE_SHAPE}</code>
      </pre>

      <h2>3. Make it match your brand</h2>
      <p>
        The widget lives in its own shadow tree, so your page&apos;s CSS cannot break it. Colours are set with four CSS variables on the element:{" "}
        <code>--sw-accent</code>, <code>--sw-text</code>, <code>--sw-bg</code> and <code>--sw-border</code>.
      </p>
      <pre className="code">
        <code>{THEME}</code>
      </pre>
      <div className="panel" style={{ maxWidth: "30rem" }}>
        <p className="small" style={{ marginTop: 0 }}>
          Live example with those colours:
        </p>
        <Widget productId="demo-05" compare="demo-04,demo-10" style={purple} />
      </div>

      <h2>4. What the widget sends</h2>
      <ul>
        {SENT.map((s) => (
          <li key={s} style={{ marginBottom: ".5rem" }}>
            {s}
          </li>
        ))}
      </ul>

      <h2>5. Limits</h2>
      <ul>
        <li>The result is cosmetic guidance from a photo, not medical advice, and not a promise of how a shade looks in person.</li>
        <li>The widget refuses photos it cannot trust, on the device, before any paid analysis is made.</li>
        <li>This demo uses a made-up catalogue. Shade colours should come from your own product data.</li>
      </ul>
    </StoreShell>
  );
}
