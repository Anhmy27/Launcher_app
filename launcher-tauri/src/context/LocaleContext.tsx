import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { en } from "../locales/en";
import { vi } from "../locales/vi";

export type Locale = "en" | "vi";
export type Messages = { [K in keyof typeof en]: string };

const messages: Record<Locale, Messages> = { en, vi };
const STORAGE_KEY = "launcher-locale";

interface LocaleContextType {
  locale: Locale;
  t: Messages;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  distLabel: (type?: string) => string;
}

const LocaleContext = createContext<LocaleContextType | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "en" || saved === "vi" ? saved : "vi";
  });

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  const toggleLocale = () => {
    setLocale(locale === "vi" ? "en" : "vi");
  };

  const t = messages[locale];

  const distLabel = (type?: string) => {
    switch (type) {
      case "url": return t.distUrl;
      case "installer": return t.distInstaller;
      default: return t.distPortable;
    }
  };

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <LocaleContext.Provider value={{ locale, t, setLocale, toggleLocale, distLabel }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
