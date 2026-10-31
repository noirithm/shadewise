import type { Metadata } from "next";
import { StoreShell } from "../_components/StoreShell";
import { DashboardClient } from "./DashboardClient";
import "./dashboard.css";

export const metadata: Metadata = {
  title: "Merchant dashboard · ShadeWise demo",
  description: "Aggregate, photo-free numbers: verdicts, refused photos, retake-then-success and cost per session.",
};

export default function DashboardPage() {
  return (
    <StoreShell>
      <h1 style={{ marginTop: 0 }}>Merchant dashboard</h1>
      <p>What a brand would see: how often shoppers get a confident answer, why photos get refused, and what each session costs.</p>
      <DashboardClient />
    </StoreShell>
  );
}
