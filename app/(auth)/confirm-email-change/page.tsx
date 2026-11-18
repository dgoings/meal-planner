import type { Metadata } from "next";
import { ConfirmEmailChangeLanding } from "@/components/auth/link-landing";

export const metadata: Metadata = { title: "Confirm your new email" };

export default function ConfirmEmailChangePage() {
  return <ConfirmEmailChangeLanding />;
}
