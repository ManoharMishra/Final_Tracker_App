"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useUserContext } from "@/lib/context/user-context";
import type { ThreadDetailResponse } from "@/lib/types/thread.types";
import { getThreadById, getParticipants } from "@/lib/api/threads";
import type { ParticipantResponse } from "@/lib/types/participant.types";
import type { MessageListItem } from "@/lib/types/message.types";
import { getMessages, createMessage } from "@/lib/api/messages";
import type { DecisionListItem } from "@/lib/types/decision.types";
import { getDecisions, createDecision } from "@/lib/api/decisions";
import type { TaskListItem, TaskStatus } from "@/lib/types/task.types";
import { getTasks, createTask, updateTaskStatus } from "@/lib/api/tasks";
import type { AttachmentItem } from "@/lib/types/attachment.types";
import {
  generateUploadUrl,
  getAttachments,
  saveAttachment,
} from "@/lib/api/attachments";
import type { NotificationItem } from "@/lib/types/notification.types";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api/notifications";
import { getMyWork } from "@/lib/api/my-work";
import type { MyWorkResponse } from "@/lib/types/mywork.types";
import styles from "../threads.module.css";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function statusBadgeClass(status: string) {
  if (status === "open") return styles.badgeOpen;
  if (status === "dormant") return styles.badgeDormant;
  return styles.badgeConverted;
}

interface ActivityItem {
  id: string;
  actor_id: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string;
  title: string;
  created_at: string;
}

interface ActivityResponse {
  data: ActivityItem[];
}

interface ThreadSummaryItem {
  id: string;
  thread_id: string;
  content: string;
  version: number;
  created_by: string;
  created_at: string;
}

interface LatestSummaryResponse {
  data: ThreadSummaryItem | null;
}

export default function ThreadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { initialized, user_id } = useUserContext();
  const sessionUserId = user_id ?? "";
  const [activeMyWorkTab, setActiveMyWorkTab] = useState<"tasks" | "mentions" | "notifications" | "activity">("tasks");
  const [thread, setThread] = useState<ThreadDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myWork, setMyWork] = useState<MyWorkResponse>({
    tasks: [],
    mentions: [],
    notifications: [],
  });
  const [myWorkLoading, setMyWorkLoading] = useState(true);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [latestSummary, setLatestSummary] = useState<ThreadSummaryItem | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [summaryText, setSummaryText] = useState("");
  const [showSummaryForm, setShowSummaryForm] = useState(false);
  const [addingSummary, setAddingSummary] = useState(false);

  const [participants, setParticipants] = useState<ParticipantResponse[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(true);
  const [participantsError, setParticipantsError] = useState<string | null>(null);

  const [messages, setMessages] = useState<MessageListItem[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [taskFromMessageId, setTaskFromMessageId] = useState<string | null>(null);
  const [decisionFromMessageId, setDecisionFromMessageId] = useState<string | null>(null);

  const [decisions, setDecisions] = useState<DecisionListItem[]>([]);
  const [decisionsLoading, setDecisionsLoading] = useState(true);
  const [decisionsError, setDecisionsError] = useState<string | null>(null);
  const [decisionText, setDecisionText] = useState("");
  const [addingDecision, setAddingDecision] = useState(false);

  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [markingNotificationId, setMarkingNotificationId] = useState<string | null>(
    null
  );

  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    if (!initialized) return;

    if (!isUuid(sessionUserId)) {
      setError("Invalid session. Please login again.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setMyWorkLoading(true);
    setParticipantsLoading(true);
    setMessagesLoading(true);
    setDecisionsLoading(true);
    setAttachmentsLoading(true);
    setNotificationsLoading(true);
    setActivityLoading(true);
    setSummaryLoading(true);
    setTasksLoading(true);
    setError(null);
    setActivityError(null);
    setMessagesError(null);
    setTasksError(null);
    setDecisionsError(null);
    setParticipantsError(null);

    getThreadById(id)
      .then(async (threadData) => {
        let messageData: Awaited<ReturnType<typeof getMessages>> = {
          data: [],
          pagination: { page: 1, limit: 20, total: 0, total_pages: 0 },
        };
        try {
          const res = await getMessages(id, 1, 20);
          console.log("MESSAGES:", res);

          if (!res || !Array.isArray(res.data)) {
            console.error("WRONG SHAPE: GET /api/messages", { response: res });
            setMessagesError("Messages response has wrong shape.");
          } else {
            messageData = res;
          }
        } catch (e) {
          console.error("FAILED ENDPOINT: GET /api/messages", e);
          setMessagesError(
            `Messages failed: ${e instanceof Error ? e.message : "Unknown error"}`
          );
        }

        let taskData: Awaited<ReturnType<typeof getTasks>> = {
          data: [],
          pagination: { page: 1, limit: 20, total: 0, total_pages: 0 },
        };
        try {
          const res = await getTasks(id, 1, 20);
          console.log("TASKS:", res);

          if (!res || !Array.isArray(res.data)) {
            console.error("WRONG SHAPE: GET /api/tasks", { response: res });
            setTasksError("Tasks response has wrong shape.");
          } else {
            taskData = res;
          }
        } catch (e) {
          console.error("FAILED ENDPOINT: GET /api/tasks", e);
          setTasksError(
            `Tasks failed: ${e instanceof Error ? e.message : "Unknown error"}`
          );
        }

        let decisionData: Awaited<ReturnType<typeof getDecisions>>;
        try {
          const res = await getDecisions(id, 1, 20);
          console.log("DECISIONS:", res);

          if (!res || !Array.isArray(res.data)) {
            console.error("WRONG SHAPE: GET /api/decisions", { response: res });
            setDecisionsError("Decisions response has wrong shape.");
            decisionData = {
              data: [],
              pagination: { page: 1, limit: 20, total: 0, total_pages: 0 },
            };
          } else {
            decisionData = res;
          }
        } catch (e) {
          console.error("FAILED ENDPOINT: GET /api/decisions", e);
          setDecisionsError(
            `Decisions failed: ${e instanceof Error ? e.message : "Unknown error"}`
          );
          decisionData = {
            data: [],
            pagination: { page: 1, limit: 20, total: 0, total_pages: 0 },
          };
        }

        let participantData: ParticipantResponse[] = [];
        try {
          const res = await getParticipants(id);
          console.log("PARTICIPANTS:", res);

          if (!Array.isArray(res)) {
            console.error("WRONG SHAPE: GET /api/threads/:id/participants", {
              response: res,
            });
            setParticipantsError("Participants response has wrong shape.");
          } else {
            participantData = res;
          }
        } catch (e) {
          console.error("FAILED ENDPOINT: GET /api/threads/:id/participants", e);
          setParticipantsError(
            `Participants failed: ${e instanceof Error ? e.message : "Unknown error"}`
          );
        }

        const isSessionUserParticipant = participantData.some(
          (participant) => participant.user_id === sessionUserId
        );

        if (!isSessionUserParticipant && threadData.type !== "org") {
          console.warn("SESSION CHECK: user is not participant on non-org thread", {
            userId: sessionUserId,
            threadId: id,
            threadType: threadData.type,
            orgId: threadData.org_id,
          });
        }

        if (messageData.data.length === 0) {
          console.warn("MESSAGES empty: trace src/services/message.service.ts getMessages where.thread_id", {
            threadId: id,
            orgId: threadData.org_id,
            isSessionUserParticipant,
          });
        }

        if (taskData.data.length === 0) {
          console.warn("TASKS empty: trace src/services/task.service.ts getTasks where.thread_id", {
            threadId: id,
            orgId: threadData.org_id,
            isSessionUserParticipant,
          });
        }

        if (decisionData.data.length === 0) {
          console.warn("DECISIONS empty: trace src/services/decision.service.ts getDecisions where.thread_id", {
            threadId: id,
            orgId: threadData.org_id,
            isSessionUserParticipant,
          });
        }

        if (messageData.data.some((item) => item.thread_id !== id)) {
          console.warn("MESSAGES thread_id mismatch detected", { expectedThreadId: id });
        }

        if (taskData.data.some((item) => item.thread_id !== id)) {
          console.warn("TASKS thread_id mismatch detected", { expectedThreadId: id });
        }

        if (decisionData.data.some((item) => item.thread_id !== id)) {
          console.warn("DECISIONS thread_id mismatch detected", { expectedThreadId: id });
        }

        const notificationData = await getNotifications({
          page: 1,
          limit: 20,
        }).catch(() => ({ data: [] as NotificationItem[] }));

        const myWorkData = await getMyWork().catch(
          () =>
            ({
              tasks: [],
              mentions: [],
              notifications: [],
            }) as MyWorkResponse
        );

        let activityData: ActivityResponse = { data: [] };
        try {
          const res = await fetch(`/api/threads/${id}/activity?page=1&limit=20`);
          if (!res.ok) {
            throw new Error("Failed to fetch activity");
          }
          activityData = (await res.json()) as ActivityResponse;
        } catch (e) {
          setActivityError(
            `Activity failed: ${e instanceof Error ? e.message : "Unknown error"}`
          );
        }

        const summaryData = await fetch(
          `/api/threads/${id}/summaries/latest`
        )
          .then(async (res) => {
            if (!res.ok) {
              throw new Error("Failed to fetch latest summary");
            }
            return (await res.json()) as LatestSummaryResponse;
          })
          .catch(() => ({ data: null as ThreadSummaryItem | null }));

        const attachmentData = await getAttachments(
          {
            entity_type: "thread",
            entity_id: threadData.id,
          },
          1,
          20
        ).catch(() => ({ data: [] as AttachmentItem[] }));

        setThread(threadData);
        setParticipants(participantData);
        setMessages(messageData.data);
        setDecisions(decisionData.data);
        setMyWork(myWorkData);
        setNotifications(notificationData.data);
        setActivity(activityData.data ?? []);
        setLatestSummary(summaryData.data ?? null);
        setAttachments(attachmentData.data);
        setTasks(taskData.data);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        setLoading(false);
        setMyWorkLoading(false);
        setParticipantsLoading(false);
        setMessagesLoading(false);
        setDecisionsLoading(false);
        setAttachmentsLoading(false);
        setNotificationsLoading(false);
        setActivityLoading(false);
        setSummaryLoading(false);
        setTasksLoading(false);
      });
  }, [id, initialized, sessionUserId]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const myWorkUnreadCount = myWork.notifications.filter((n) => !n.is_read).length;

  async function handleNotificationClick(notificationId: string) {
    if (markingNotificationId || !notifications.some((n) => n.id === notificationId)) {
      return;
    }

    const notification = notifications.find((n) => n.id === notificationId);
    if (!notification || notification.is_read) {
      return;
    }

    try {
      setMarkingNotificationId(notificationId);
      await markNotificationRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mark notification as read");
    } finally {
      setMarkingNotificationId(null);
    }
  }

  async function handleMarkAllRead() {
    if (markingAllRead || unreadCount === 0) return;

    try {
      setMarkingAllRead(true);
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mark all notifications read");
    } finally {
      setMarkingAllRead(false);
    }
  }

  function formatNotificationTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
  }

  function renderMyWorkList() {
    if (myWorkLoading) {
      return <p className={styles.loading}>Loading my work…</p>;
    }

    if (activeMyWorkTab === "tasks") {
      return myWork.tasks.length === 0 ? (
        <p className={styles.empty}>No assigned tasks.</p>
      ) : (
        <ul className={styles.decisionList}>
          {myWork.tasks.map((task) => (
            <li key={task.id} className={styles.decisionItem}>
              <strong>{task.title}</strong>
              <div>{task.status}</div>
            </li>
          ))}
        </ul>
      );
    }

    if (activeMyWorkTab === "mentions") {
      return myWork.mentions.length === 0 ? (
        <p className={styles.empty}>No mentions.</p>
      ) : (
        <ul className={styles.decisionList}>
          {myWork.mentions.map((mention) => (
            <li key={mention.id} className={styles.decisionItem}>
              <strong>Mention</strong>
              <div>{mention.content}</div>
            </li>
          ))}
        </ul>
      );
    }

    if (activeMyWorkTab === "activity") {
      if (activityLoading) {
        return <p className={styles.loading}>Loading activity…</p>;
      }

      if (activityError) {
        return <p className={styles.error}>{activityError}</p>;
      }

      return activity.length === 0 ? (
        <p className={styles.empty}>No activity.</p>
      ) : (
        <ul className={styles.decisionList}>
          {activity.map((item) => (
            <li key={item.id} className={styles.decisionItem}>
              <Link
                href={item.entity_type === "thread" ? `/threads/${item.entity_id}` : `/threads/${id}`}
                className={styles.activityLink}
              >
                <strong>{item.title}</strong>
                <div>{formatNotificationTime(item.created_at)}</div>
              </Link>
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
            <div>{formatNotificationTime(notification.created_at)}</div>
          </li>
        ))}
      </ul>
    );
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || !messageText.trim() || sending) return;

    try {
      setSending(true);
      setError(null);
      await createMessage({ thread_id: id, content: messageText.trim() });
      setMessageText("");
      const refreshed = await getMessages(id, 1, 20);
      setMessages(refreshed.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  async function handleAddDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!id || !decisionText.trim() || addingDecision) {
      return;
    }

    try {
      setAddingDecision(true);
      setError(null);

      await createDecision({ thread_id: id, content: decisionText.trim() });

      setDecisionText("");

      const refreshed = await getDecisions(id, 1, 20);
      setDecisions(refreshed.data);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to add decision";
      setError(message);
    } finally {
      setAddingDecision(false);
    }
  }

  async function handleAddTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || !taskTitle.trim() || addingTask) return;

    const assignee = taskAssignee.trim();
    if (assignee && !isUuid(assignee)) {
      setError("Assigned-to must be a valid UUID");
      return;
    }

    try {
      setAddingTask(true);
      setError(null);
      await createTask({
        thread_id: id,
        title: taskTitle.trim(),
        ...(assignee ? { assigned_to: assignee } : {}),
      });
      setTaskTitle("");
      setTaskAssignee("");
      const refreshed = await getTasks(id, 1, 20);
      setTasks(refreshed.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add task");
    } finally {
      setAddingTask(false);
    }
  }

  async function handleUpdateTaskStatus(taskId: string, status: TaskStatus) {
    if (!id || updatingTaskId) return;

    try {
      setUpdatingTaskId(taskId);
      setError(null);
      await updateTaskStatus(taskId, status);
      const refreshed = await getTasks(id, 1, 20);
      setTasks(refreshed.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update task status");
    } finally {
      setUpdatingTaskId(null);
    }
  }

  async function handleConvertMessageToTask(message: MessageListItem) {
    if (!id || taskFromMessageId || decisionFromMessageId) return;

    const messageTextContent = message.content.trim();
    if (!messageTextContent) {
      setError("Message content is empty");
      return;
    }

    const taskTitle =
      messageTextContent.length > 120
        ? `${messageTextContent.slice(0, 117).trim()}...`
        : messageTextContent;

    try {
      setTaskFromMessageId(message.id);
      setError(null);
      await createTask({
        title: taskTitle,
        thread_id: id,
        source_message_id: message.id,
      });

      const refreshedTasks = await getTasks(id, 1, 20);
      setTasks(refreshedTasks.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to convert message to task");
    } finally {
      setTaskFromMessageId(null);
    }
  }

  async function handleMarkMessageAsDecision(message: MessageListItem) {
    if (!id || decisionFromMessageId || taskFromMessageId) return;

    const messageTextContent = message.content.trim();
    if (!messageTextContent) {
      setError("Message content is empty");
      return;
    }

    try {
      setDecisionFromMessageId(message.id);
      setError(null);
      await createDecision({
        thread_id: id,
        content: messageTextContent,
        source_message_id: message.id,
      });

      const refreshedDecisions = await getDecisions(id, 1, 20);
      setDecisions(refreshedDecisions.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mark message as decision");
    } finally {
      setDecisionFromMessageId(null);
    }
  }

  async function handleUploadAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || !thread || !selectedFile || uploadingAttachment) return;

    try {
      setUploadingAttachment(true);
      setError(null);

      const uploadData = await generateUploadUrl(
        {
          file_name: selectedFile.name,
          file_type: selectedFile.type || "application/octet-stream",
          file_size: selectedFile.size,
          entity_type: "thread",
          entity_id: thread.id,
          thread_id: thread.id,
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 400));

      await saveAttachment(
        {
          file_name: selectedFile.name,
          file_type: selectedFile.type || "application/octet-stream",
          file_size: selectedFile.size,
          file_url: uploadData.file_url,
          entity_type: "thread",
          entity_id: thread.id,
          thread_id: thread.id,
        }
      );

      const refreshed = await getAttachments(
        {
          entity_type: "thread",
          entity_id: thread.id,
        },
        1,
        20
      );
      setAttachments(refreshed.data);
      setSelectedFile(null);
      event.currentTarget.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload attachment");
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function handleAddSummary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || addingSummary || !summaryText.trim()) return;

    try {
      setAddingSummary(true);
      setError(null);

      const res = await fetch(`/api/threads/${id}/summaries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: summaryText.trim() }),
      });

      const json = await res.json();
      if (!res.ok) {
        const message = json?.error?.message ?? "Failed to add summary";
        throw new Error(message);
      }

      const latestRes = await fetch(`/api/threads/${id}/summaries/latest`);

      const latestJson = (await latestRes.json()) as LatestSummaryResponse & {
        error?: { message?: string };
      };
      if (!latestRes.ok) {
        const message = latestJson.error?.message ?? "Failed to refresh summary";
        throw new Error(message);
      }

      setLatestSummary(latestJson.data ?? null);
      setSummaryText("");
      setShowSummaryForm(false);
      setSummaryExpanded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add summary");
    } finally {
      setAddingSummary(false);
    }
  }

  if (loading) return <p className={styles.loading}>Loading…</p>;
  if (!thread) {
    return error ? <p className={styles.error}>{error}</p> : null;
  }

  return (
    <>
      <Link href="/threads" className={styles.backLink}>
        ← Back to threads
      </Link>

      {error && <p className={styles.error}>{error}</p>}

      {/* Title + status */}
      <div className={styles.detailHeader}>
        <h1 className={styles.detailTitle}>{thread.title}</h1>
        <span className={`${styles.badge} ${statusBadgeClass(thread.status)}`}>
          {thread.status}
        </span>
      </div>

      {/* Goal */}
      {thread.goal && (
        <div className={styles.goal}>
          <strong>Goal:</strong> {thread.goal}
        </div>
      )}

      <div className={styles.summaryPanel}>
        <div className={styles.summaryTopRow}>
          <button
            type="button"
            className={styles.summaryToggle}
            onClick={() => setSummaryExpanded((prev) => !prev)}
          >
            {summaryExpanded ? "Hide Summary" : "Show Summary"}
          </button>

          <button
            type="button"
            className={styles.messageActionButton}
            onClick={() => {
              setShowSummaryForm((prev) => !prev);
              setSummaryExpanded(true);
            }}
          >
            Create Summary
          </button>
        </div>

        {summaryExpanded && (
          <div className={styles.summaryPanelBody}>
            {summaryLoading ? (
              <p className={styles.loading}>Loading summary…</p>
            ) : latestSummary ? (
              <div className={styles.summaryContent}>{latestSummary.content}</div>
            ) : (
              <p className={styles.empty}>No summary yet.</p>
            )}

            {showSummaryForm && (
              <form className={styles.summaryForm} onSubmit={handleAddSummary}>
                <textarea
                  className={styles.summaryTextarea}
                  value={summaryText}
                  onChange={(e) => setSummaryText(e.target.value)}
                  placeholder="Write a short summary"
                  rows={4}
                />
                <button
                  className={styles.submitBtn}
                  type="submit"
                  disabled={addingSummary || !summaryText.trim()}
                >
                  {addingSummary ? "Creating…" : "Create Summary"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>My Work</h2>
          <p className={styles.sectionHint}>Your assigned items and updates.</p>
        </div>

        <div className={styles.sectionBody}>
          <div className={styles.tabRow}>
            <button
              className={activeMyWorkTab === "tasks" ? styles.tabActive : styles.tabButton}
              type="button"
              onClick={() => setActiveMyWorkTab("tasks")}
            >
              Tasks ({myWork.tasks.length})
            </button>
            <button
              className={activeMyWorkTab === "mentions" ? styles.tabActive : styles.tabButton}
              type="button"
              onClick={() => setActiveMyWorkTab("mentions")}
            >
              Mentions ({myWork.mentions.length})
            </button>
            <button
              className={activeMyWorkTab === "notifications" ? styles.tabActive : styles.tabButton}
              type="button"
              onClick={() => setActiveMyWorkTab("notifications")}
            >
              Notifications ({myWorkUnreadCount})
            </button>
            <button
              className={activeMyWorkTab === "activity" ? styles.tabActive : styles.tabButton}
              type="button"
              onClick={() => setActiveMyWorkTab("activity")}
            >
              Activity ({activity.length})
            </button>
          </div>
          {renderMyWorkList()}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Notifications ({unreadCount} unread)</h2>
          <p className={styles.sectionHint}>Your recent updates.</p>
        </div>

        <div className={styles.sectionBody}>
          <button
            className={styles.submitBtn}
            type="button"
            onClick={handleMarkAllRead}
            disabled={markingAllRead || unreadCount === 0}
          >
            {markingAllRead ? "Marking..." : "Mark all read"}
          </button>

          {notificationsLoading ? (
            <p className={styles.loading}>Loading notifications…</p>
          ) : notifications.length === 0 ? (
            <p className={styles.empty}>No notifications.</p>
          ) : (
            <ul className={styles.decisionList}>
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={styles.decisionItem}
                  onClick={() => handleNotificationClick(n.id)}
                  style={{
                    cursor: n.is_read ? "default" : "pointer",
                    opacity: n.is_read ? 0.75 : 1,
                  }}
                >
                  <strong>{n.title}</strong>
                  <div>{formatNotificationTime(n.created_at)}</div>
                  {!n.is_read && markingNotificationId === n.id && (
                    <div>Marking as read...</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Participants ──────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>
            Participants ({participants.length})
          </h2>
          <p className={styles.sectionHint}>People in this thread and their roles.</p>
        </div>

        <div className={styles.sectionBody}>
          <h3 className={styles.subsectionTitle}>Members</h3>
          {participantsLoading ? (
            <p className={styles.loading}>Loading participants…</p>
          ) : participantsError ? (
            <p className={styles.error}>{participantsError}</p>
          ) : participants.length === 0 ? (
            <p className={styles.empty}>No participants.</p>
          ) : (
            <div className={styles.participantList}>
              {participants.map((p) => (
                <div key={p.id} className={styles.participantRow}>
                  <span className={styles.participantName}>{p.user.name}</span>
                  <span
                    className={`${styles.badge} ${
                      p.role === "owner" ? styles.badgeOwner : styles.badgeMember
                    }`}
                  >
                    {p.role}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Messages ──────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Messages</h2>
          <p className={styles.sectionHint}>Conversation in this thread.</p>
        </div>

        <div className={styles.sectionBody}>
          <h3 className={styles.subsectionTitle}>Recent</h3>
          {messagesLoading ? (
            <p className={styles.loading}>Loading messages…</p>
          ) : messagesError ? (
            <p className={styles.error}>{messagesError}</p>
          ) : messages.length === 0 ? (
            <p className={styles.empty}>No messages yet.</p>
          ) : (
            <ul className={styles.decisionList}>
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={`${styles.decisionItem} ${
                    m.metadata?.mentions?.includes(sessionUserId)
                      ? styles.mentionedMessage
                      : ""
                  }`}
                >
                  <strong>{m.author?.name ?? "Unknown"}</strong>
                  <div>{m.content}</div>
                  <div className={styles.messageActionRow}>
                    <button
                      className={styles.messageActionButton}
                      type="button"
                      onClick={() => handleConvertMessageToTask(m)}
                      disabled={
                        Boolean(taskFromMessageId) || Boolean(decisionFromMessageId)
                      }
                    >
                      {taskFromMessageId === m.id ? "Converting..." : "Convert to Task"}
                    </button>
                    <button
                      className={styles.messageActionButton}
                      type="button"
                      onClick={() => handleMarkMessageAsDecision(m)}
                      disabled={
                        Boolean(taskFromMessageId) || Boolean(decisionFromMessageId)
                      }
                    >
                      {decisionFromMessageId === m.id
                        ? "Marking..."
                        : "Mark as Decision"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h3 className={styles.subsectionTitle}>Send Message</h3>
          <form className={styles.createForm} onSubmit={handleSendMessage}>
            <input
              className={styles.input}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Write a message"
            />
            <button
              className={styles.submitBtn}
              type="submit"
              disabled={sending || !messageText.trim()}
            >
              {sending ? "Sending…" : "Send message"}
            </button>
          </form>
        </div>
      </div>

      {/* ── Decisions ─────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Decisions</h2>
          <p className={styles.sectionHint}>Key outcomes captured for this thread.</p>
        </div>

        <div className={styles.sectionBody}>
          <h3 className={styles.subsectionTitle}>Recorded</h3>
          {decisionsLoading ? (
            <p className={styles.loading}>Loading decisions…</p>
          ) : decisionsError ? (
            <p className={styles.error}>{decisionsError}</p>
          ) : decisions.length === 0 ? (
            <p className={styles.empty}>No decisions yet.</p>
          ) : (
            <ul className={styles.decisionList}>
              {decisions.map((d) => (
                <li key={d.id} className={styles.decisionItem}>
                  <strong>{d.creator?.name ?? "Unknown"}</strong>
                  <div>{d.content}</div>
                </li>
              ))}
            </ul>
          )}

          <h3 className={styles.subsectionTitle}>Add Decision</h3>
          <form className={styles.createForm} onSubmit={handleAddDecision}>
            <input
              className={styles.input}
              value={decisionText}
              onChange={(e) => setDecisionText(e.target.value)}
              placeholder="Record a decision"
            />
            <button
              className={styles.submitBtn}
              type="submit"
              disabled={addingDecision || !decisionText.trim()}
            >
              {addingDecision ? "Adding…" : "Add decision"}
            </button>
          </form>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Attachments</h2>
          <p className={styles.sectionHint}>Files linked to this thread.</p>
        </div>

        <div className={styles.sectionBody}>
          <h3 className={styles.subsectionTitle}>Files</h3>
          {attachmentsLoading ? (
            <p className={styles.loading}>Loading attachments…</p>
          ) : attachments.length === 0 ? (
            <p className={styles.empty}>No attachments yet.</p>
          ) : (
            <ul className={styles.decisionList}>
              {attachments.map((attachment) => (
                <li key={attachment.id} className={styles.decisionItem}>
                  <a href={attachment.file_url} target="_blank" rel="noreferrer">
                    {attachment.file_name}
                  </a>
                </li>
              ))}
            </ul>
          )}

          <h3 className={styles.subsectionTitle}>Upload File</h3>
          <form className={styles.createForm} onSubmit={handleUploadAttachment}>
            <input
              className={styles.input}
              type="file"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />
            <button
              className={styles.submitBtn}
              type="submit"
              disabled={uploadingAttachment || !selectedFile}
            >
              {uploadingAttachment ? "Uploading…" : "Upload"}
            </button>
          </form>
        </div>
      </div>

      {/* ── Tasks ─────────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Tasks</h2>
          <p className={styles.sectionHint}>Action items and current progress.</p>
        </div>

        <div className={styles.sectionBody}>
          <h3 className={styles.subsectionTitle}>Current Tasks</h3>
          {tasksLoading ? (
            <p className={styles.loading}>Loading tasks…</p>
          ) : tasksError ? (
            <p className={styles.error}>{tasksError}</p>
          ) : tasks.length === 0 ? (
            <p className={styles.empty}>No tasks yet.</p>
          ) : (
            <ul className={styles.decisionList}>
              {tasks.map((t) => (
                <li key={t.id} className={styles.decisionItem}>
                  <strong>{t.title}</strong>
                  <div className={styles.taskStatusRow}>
                    <span>Status:</span>
                    <select
                      className={styles.select}
                      value={t.status}
                      disabled={updatingTaskId === t.id}
                      onChange={(e) =>
                        handleUpdateTaskStatus(t.id, e.target.value as TaskStatus)
                      }
                    >
                      <option value="open">open</option>
                      <option value="in_progress">in_progress</option>
                      <option value="done">done</option>
                    </select>
                  </div>
                  {t.assignee && <div>Assigned to: {t.assignee.name}</div>}
                </li>
              ))}
            </ul>
          )}

          <h3 className={styles.subsectionTitle}>Create Task</h3>
          <form className={styles.createForm} onSubmit={handleAddTask}>
            <input
              className={styles.input}
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Task title"
            />
            <input
              className={styles.input}
              value={taskAssignee}
              onChange={(e) => setTaskAssignee(e.target.value)}
              placeholder="Assign to (user UUID, optional)"
            />
            <button
              className={styles.submitBtn}
              type="submit"
              disabled={addingTask || !taskTitle.trim()}
            >
              {addingTask ? "Adding…" : "Add task"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
