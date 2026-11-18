import type { Metadata } from "next";
import { ValidateEmailLanding } from "@/components/auth/link-landing";

export const metadata: Metadata = { title: "Confirm your email" };

export default function ValidateEmailPage() {
  return <ValidateEmailLanding />;
}
