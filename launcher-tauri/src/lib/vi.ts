/** @deprecated Use useLocale() from context/LocaleContext */
export { vi } from "../locales/vi";
export { en } from "../locales/en";

export function distLabel(type?: string): string {
  switch (type) {
    case "installer": return "Installer";
    default: return "Portable";
  }
}
