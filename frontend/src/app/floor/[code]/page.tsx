"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FloorPhone } from "@/components/production/floor-phone";
import { rememberFloorReturn } from "@/components/production/floor-return";
import { useSession } from "@/components/providers/session-provider";

export default function FloorCheckinPage() {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === "anonymous") {
      rememberFloorReturn(window.location.pathname);
      router.replace("/login");
      return;
    }
    if (status === "company-selection" || status === "branch-selection") {
      rememberFloorReturn(window.location.pathname);
      router.replace("/select-branch");
    }
  }, [router, status]);

  if (status !== "authenticated") {
    return <div className="loading-state">Abrindo o check-in…</div>;
  }

  return (
    <main className="floor-phone">
      <FloorPhone />
    </main>
  );
}
