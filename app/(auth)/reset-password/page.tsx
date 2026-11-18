import type { Metadata } from "next";
import { ResetPasswordLanding } from "@/components/auth/link-landing";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return <ResetPasswordLanding />;
}
