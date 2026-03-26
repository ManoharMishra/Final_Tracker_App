"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUserContext } from "@/lib/context/user-context";
import { getMyWork } from "@/lib/api/my-work";
import type { MyWorkResponse } from "@/lib/types/mywork.types";
import styles from "../threads/threads.module.css";

type MyWorkTab = "tasks" | "mentions" | "notifications";

const EMPTY_MY_WORK: MyWorkResponse = {
  tasks: [],
  mentions: [],
  notifications: [],
};

export default function MyWorkPage() {
  const { initialized, user_id } = useUserContext();
  const [activeTab, setActiveTab] = useState<MyWorkTab>("tasks");
  const [myWork, setMyWork] = useState<MyWorkResponse>(EMPTY_MY_WORK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialized || !user_id) {
      return;
    }

    let cancelled = false;

    async function loadMyWork() {
      setLoading(true);
      setError(null);

      try {
        const data = await getMyWork();
        if (!cancelled) {
          setMyWork(data);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load my work");
          setMyWork(EMPTY_MY_WORK);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMyWork();

    return () => {
      cancelled = true;
    };
  }, [initialized, user_id]);

  const resolvedError = initialized && !user_id ? "Invalid session. Please login again." : error;
  const resolvedLoading = initialized && !user_id ? false : loading;

  const unreadNotifications = myWork.notifications.filter((item) => !item.is_read).length;

  function formatTimestamp(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
  }

  function renderTabContent() {
    if (resolvedLoading) {
      return <p className={styles.loading}>Loading my work…</p>;
    }

    if (activeTab === "tasks") {
      return myWork.tasks.length === 0 ? (
        <p className={styles.empty}>No assigned tasks.</p>
      ) : (
        <ul className={styles.decisionList}>
          {myWork.tasks.map((task) => (
            <li key={task.id} className={styles.decisionItem}>
              <strong>{task.title}</strong>
              <div>Status: {task.status}</div>
              {task.thread_id && (
                <div>
                  <Link href={`/threads/${task.thread_id}`}>Open thread</Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      );
    }

    if (activeTab === "mentions") {
      return myWork.mentions.length === 0 ? (
        <p className={styles.empty}>No mentions.</p>
      ) : (
        <ul className={styles.decisionList}>
          {myWork.mentions.map((mention) => (
            <li key={mention.id} className={styles.decisionItem}>
              <strong>Mention</strong>
              <div>{mention.content}</div>
              <div>
                <Link href={`/threads/${mention.thread_id}`}>Open thread</Link>
              </div>
            </li>
          ))}
        </ul>
      );
    }

    return myWork.notifications.length === 0 ? (
      <p className={styles.empty}>No notifications.</p>
    ) : (
      <ul className={styles.decisionList}>
        {myWork.notifications.map((notification) => (
          <li key={notification.id} className={styles.decisionItem}>
            <strong>{notification.title}</strong>
            <div>{formatTimestamp(notification.created_at)}</div>
            <div>{notification.is_read ? "Read" : "Unread"}</div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h1 className={styles.pageTitle}>My Work</h1>
        <p className={styles.sectionHint}>Tasks, mentions, and notifications assigned to you.</p>
      </div>

      {resolvedError && <p className={styles.error}>{resolvedError}</p>}

      <div className={styles.sectionBody}>
        <div className={styles.tabRow}>
          <button
            className={activeTab === "tasks" ? styles.tabActive : styles.tabButton}
            type="button"
            onClick={() => setActiveTab("tasks")}
          >
            Tasks ({myWork.tasks.length})
          </button>
          <button
            className={activeTab === "mentions" ? styles.tabActive : styles.tabButton}
            type="button"
            onClick={() => setActiveTab("mentions")}
          >
            Mentions ({myWork.mentions.length})
          </button>
          <button
            className={activeTab === "notifications" ? styles.tabActive : styles.tabButton}
            type="button"
            onClick={() => setActiveTab("notifications")}
          >
            Notifications ({unreadNotifications})
          </button>
        </div>

        {renderTabContent()}
      </div>
    </div>
  );
}