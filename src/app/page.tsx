import type { Metadata } from "next";
import { CATALOGUE, CATALOGUE_LABEL } from "@/config/catalogue";
import { inr } from "@/shared/money";
import { StoreShell } from "./_components/StoreShell";

export const metadata: Metadata = {
  title: "ShadeWise demo store",
  description: "A demo store showing the ShadeWise shade-match widget: one selfie, an explainable verdict.",
};

export default function Home() {
  return (
    <StoreShell>
      <section className="hero" aria-labelledby="hero-title">
        <h1 id="hero-title">Know if a shade will suit you before you buy it</h1>
        <p>
          Open any product, take one selfie, and ShadeWise measures your skin tone and tells you whether the shade is a good match, a close match
          or a poor match, with the reasons. If the photo isn&apos;t good enough to trust, it says so and tells you how to retake it.
        </p>
      </section>
      <section aria-labelledby="products">
        <h2 id="products" style={{ marginTop: 0 }}>
          Skin tint foundation <span className="tag">{CATALOGUE_LABEL}</span>
        </h2>
        <ul className="grid">
          {CATALOGUE.map((p) => (
            <li key={p.id}>
              <a className="pcard" href={`/products/${p.id}`}>
                <span className="swatch" style={{ background: p.hex }} role="img" aria-label={`${p.shade} swatch colour ${p.hex}`} />
                <span className="pname">{p.shade}</span>
                <span className="pmeta">
                  {p.name} · {inr(p.priceInr)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </StoreShell>
  );
}
