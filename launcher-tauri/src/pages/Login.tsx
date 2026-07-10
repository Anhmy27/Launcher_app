import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useLocale } from "../context/LocaleContext";
import Logo from "../components/Logo";
import "./Login.css";

export default function Login() {
  const { login, register } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { locale, setLocale, t } = useLocale();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isRegister) {
        await register(email, password, fullName);
      } else {
        await login(email, password);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.errorOccurred);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-bg" />
      <div className="login-top-controls">
        <div className="lang-toggle-group" style={{ display: "flex", gap: "6px" }}>
          <button
            type="button"
            className={`lang-toggle ${locale === "vi" ? "active" : ""}`}
            onClick={() => setLocale("vi")}
          >
            VI
          </button>
          <button
            type="button"
            className={`lang-toggle ${locale === "en" ? "active" : ""}`}
            onClick={() => setLocale("en")}
          >
            EN
          </button>
        </div>
        <button
          type="button"
          className="theme-toggle"
          style={{ width: "auto", marginBottom: 0 }}
          onClick={toggleTheme}
          title={theme === "dark" ? t.themeLight : t.themeDark}
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </div>
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-mark">
            <Logo size={48} />
          </div>
          <h1>{t.appName}</h1>
          <p className="login-subtitle">
            {isRegister ? t.createAccountSubtitle : t.signInSubtitle}
          </p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="form-group">
              <label>{t.fullName}</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t.fullNamePlaceholder}
                required
              />
            </div>
          )}
          <div className="form-group">
            <label>{t.email}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.emailPlaceholder}
              required
            />
          </div>
          <div className="form-group">
            <label>{t.password}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.passwordPlaceholder}
              required
            />
          </div>
          <button type="submit" className="login-btn" disabled={loading}>
            {loading
              ? t.pleaseWait
              : isRegister
                ? t.createAccount
                : t.signIn}
          </button>
        </form>

        <div className="login-toggle">
          {isRegister ? (
            <span>
              {t.alreadyHaveAccount}{" "}
              <button type="button" onClick={() => setIsRegister(false)}>
                {t.signIn}
              </button>
            </span>
          ) : (
            <span>
              {t.noAccount}{" "}
              <button type="button" onClick={() => setIsRegister(true)}>
                {t.createOne}
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
