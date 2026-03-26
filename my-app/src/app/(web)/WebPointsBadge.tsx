"use client";

import { useEffect, useState } from "react";
import { useUserContext } from "@/lib/context/user-context";
import styles from "./web.module.css";

type PointsPayload = {
  userId: string;
  points: number;
  streak: number;
  lastActiveDate: string | null;
};

type PointsEventDetail = {
  points: number;
  streak: number;
  awarded?: number;
};

function isPointsEventDetail(value: unknown): value is PointsEventDetail {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.points === "number" && typeof v.streak === "number";
}

export default function WebPointsBadge() {
  const { user_id, initialized } = useUserContext();
  const [points, setPoints] = useState(0);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!initialized || !user_id) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadPoints() {
      setLoading(true);
      try {
        const res = await fetch("/api/points/me");
        const json = (await res.json()) as { data?: PointsPayload };
        if (!res.ok || !json.data) {
          throw new Error("Failed to load points");
        }
        if (!cancelled) {
          setPoints(json.data.points ?? 0);
          setStreak(json.data.streak ?? 0);
        }
      } catch {
        if (!cancelled) {
          setPoints(0);
          setStreak(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPoints();

    return () => {
      cancelled = true;
    };
  }, [initialized, user_id]);

  useEffect(() => {
    function onPointsUpdated(event: Event) {
      const custom = event as CustomEvent<unknown>;
      if (isPointsEventDetail(custom.detail)) {
        setPoints(custom.detail.points);
        setStreak(custom.detail.streak);
      }
    }

    window.addEventListener("points-updated", onPointsUpdated);
    return () => window.removeEventListener("points-updated", onPointsUpdated);
  }, []);

  return (
    <div className={styles.pointsBadge} aria-live="polite">
      {loading ? (
        <span className={styles.pointsLoading}>Loading points...</span>
      ) : (
        <>
          <span className={styles.pointsValue}>{points} pts</span>
          <span className={styles.pointsDivider}>|</span>
          <span className={styles.pointsStreak}>{streak} day streak</span>
        </>
      )}
    </div>
  );
}
