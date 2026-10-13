import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LabFrame } from "@/components/lab/lab-frame";

export const metadata: Metadata = {
  title: "Component lab",
  robots: { index: false, follow: false },
};

// Development-only review page. It is not reachable in production and makes no Firestore calls.
export default function LabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <LabFrame />;
}
