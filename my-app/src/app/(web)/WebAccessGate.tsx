"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUserContext } from "@/lib/context/user-context";

export default function WebAccessGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user_id, initialized } = useUserContext();

  useEffect(() => {
    if (initialized && !user_id) {
      router.replace("/login");
    }
  }, [router, user_id, initialized]);

  if (!initialized) {
    return <div>Loading workspace...</div>;
  }

  if (!user_id) {
    return <div>Redirecting to login...</div>;
  }

  return <>{children}</>;
}