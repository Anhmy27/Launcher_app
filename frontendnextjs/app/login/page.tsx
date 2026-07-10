"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { useLocale } from "@/lib/locale-context";
import Logo from "@/components/Logo";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { locale, setLocale, t } = useLocale();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loginFailed);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="flex items-center justify-center min-h-screen px-4 relative"
      style={{
        background: "var(--admin-mesh), var(--admin-bg)",
      }}
    >
      <div
        className="absolute top-5 right-5 flex items-center gap-2"
        style={{ zIndex: 2 }}
      >
        <button
          type="button"
          className={`admin-lang-toggle ${locale === "vi" ? "active" : ""}`}
          style={{ width: "auto", marginBottom: 0, padding: "8px 14px" }}
          onClick={() => setLocale("vi")}
        >
          VI
        </button>
        <button
          type="button"
          className={`admin-lang-toggle ${locale === "en" ? "active" : ""}`}
          style={{ width: "auto", marginBottom: 0, padding: "8px 14px" }}
          onClick={() => setLocale("en")}
        >
          EN
        </button>
        <button
          type="button"
          className="admin-theme-toggle"
          style={{ width: "auto", marginBottom: 0, padding: "8px 12px" }}
          onClick={toggleTheme}
          title={theme === "dark" ? t.themeLight : t.themeDark}
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo size={56} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--admin-text)" }}>
            {t.appName} Admin
          </h1>
          <p className="text-sm mt-2" style={{ color: "var(--admin-text-muted)" }}>
            {t.signInSubtitle}
          </p>
        </div>

        <div className="admin-card">
          {error && <div className="admin-alert-error">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="admin-label">{t.email}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="admin-input"
                placeholder="admin@launcher.com"
                disabled={isLoading}
                required
              />
            </div>

            <div>
              <label className="admin-label">{t.password}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="admin-input"
                placeholder="••••••••"
                disabled={isLoading}
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="admin-btn-primary w-full"
            >
              {isLoading ? t.signingIn : t.signIn}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
