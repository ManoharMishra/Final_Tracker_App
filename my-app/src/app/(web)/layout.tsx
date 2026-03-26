import Link from "next/link";
import WebSidebarNav from "./WebSidebarNav";
import WebAccessGate from "./WebAccessGate";
import WebPointsBadge from "./WebPointsBadge";
import styles from "./web.module.css";

export default function WebLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WebAccessGate>
      <div className={styles.container}>
        <header className={styles.header}>
          <Link href="/threads" className={styles.brand}>
            Thread Tracker
          </Link>
          <WebPointsBadge />
        </header>

        <div className={styles.shell}>
          <aside className={styles.sidebar}>
            <WebSidebarNav />
          </aside>
          <main className={styles.main}>{children}</main>
        </div>
      </div>
    </WebAccessGate>
  );
}