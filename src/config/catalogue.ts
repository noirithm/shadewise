// Self-defined demo products. Not real brands, not scraped data. Always labelled "demo catalogue".
export interface Product {
  id: string;
  brand: string;
  name: string;
  shade: string;
  hex: string; // the swatch colour of the shade
  priceInr: number;
}

export const CATALOGUE_LABEL = "Demo catalogue";

export const CATALOGUE: readonly Product[] = [
  { id: "demo-01", brand: "Demo Brand", name: "Skin Tint Foundation", shade: "Porcelain 01", hex: "#F3D9C6", priceInr: 899 },
  { id: "demo-02", brand: "Demo Brand", name: "Skin Tint Foundation", shade: "Ivory 02", hex: "#EBC8AE", priceInr: 899 },
  { id: "demo-03", brand: "Demo Brand", name: "Skin Tint Foundation", shade: "Sand 03", hex: "#D9AE8E", priceInr: 949 },
  { id: "demo-04", brand: "Demo Brand", name: "Skin Tint Foundation", shade: "Honey 04", hex: "#B88F76", priceInr: 949 },
  { id: "demo-05", brand: "Demo Brand", name: "Skin Tint Foundation", shade: "Caramel 05", hex: "#A57656", priceInr: 999 },
  { id: "demo-06", brand: "Demo Brand", name: "Skin Tint Foundation", shade: "Chestnut 06", hex: "#8A5A44", priceInr: 999 },
  { id: "demo-07", brand: "Demo Brand", name: "Skin Tint Foundation", shade: "Mocha 07", hex: "#6B4331", priceInr: 1049 },
  { id: "demo-08", brand: "Demo Brand", name: "Skin Tint Foundation", shade: "Espresso 08", hex: "#4A2E22", priceInr: 1049 },
];
