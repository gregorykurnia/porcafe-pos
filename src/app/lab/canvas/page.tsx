import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LabCanvas } from "@/components/lab/lab-canvas";

export const metadata: Metadata = {
  title: "Component lab canvas",
  robots: { index: false, follow: false },
};

// Rendered inside the /lab iframe so that the real breakpoints apply at each width.
export default function LabCanvasPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <LabCanvas />;
}
