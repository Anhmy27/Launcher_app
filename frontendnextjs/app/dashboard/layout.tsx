"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { useLocale } from "@/lib/locale-context";
import Logo from "@/components/Logo";
import { useEffect } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, logout, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { locale, setLocale, t } = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const navItems = [
    { href: "/dashboard", label: t.navOverview, icon: "◈" },
    { href: "/dashboard/apps", label: t.navApps, icon: "▣" },
    { href: "/dashboard/users", label: t.navUsers, icon: "◎" },
  ];

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return <div className="admin-loading">{t.loading}</div>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--admin-bg)" }}>
      <aside
        className="w-60 flex-shrink-0 flex flex-col"
        style={{
          background: "var(--admin-surface)",
          borderRight: "1px solid var(--admin-border)",
        }}
      >
        <div
          className="px-5 py-5"
          style={{ borderBottom: "1px solid var(--admin-border)" }}
        >
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <div>
              <p className="font-semibold text-sm" style={{ color: "var(--admin-text)" }}>
                {t.appName}
              </p>
              <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
                {t.adminPanel}
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: active ? "rgba(99, 102, 241, 0.12)" : "transparent",
                  color: active ? "var(--admin-accent-hover)" : "var(--admin-text-muted)",
                }}
              >
                <span className="text-base opacity-70">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4" style={{ borderTop: "1px solid var(--admin-border)" }}>
          <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
            <button
              type="button"
              className={`admin-lang-toggle ${locale === "vi" ? "active" : ""}`}
              style={{ flex: 1, marginBottom: 0 }}
              onClick={() => setLocale("vi")}
            >
              VI
            </button>
            <button
              type="button"
              className={`admin-lang-toggle ${locale === "en" ? "active" : ""}`}
              style={{ flex: 1, marginBottom: 0 }}
              onClick={() => setLocale("en")}
            >
              EN
            </button>
          </div>
          <button
            type="button"
            className="admin-theme-toggle"
            onClick={toggleTheme}
          >
            {theme === "dark" ? "☀️" : "🌙"}
            <span>{theme === "dark" ? t.themeLight : t.themeDark}</span>
          </button>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white"
              style={{
                background: "linear-gradient(135deg, var(--admin-accent), #a78bfa)",
              }}
            >
              {user?.full_name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate" style={{ color: "var(--admin-text)" }}>
                {user?.full_name}
              </p>
              <p className="text-xs truncate" style={{ color: "var(--admin-text-muted)" }}>
                {user?.email}
              </p>
            </div>
          </div>
          <button onClick={logout} className="admin-btn-ghost w-full">
            {t.signOut}
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
