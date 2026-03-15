import { createContext, useContext } from "react";
import { t as translate, type Lang } from "./i18n";

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: Parameters<typeof translate>[0]) => string;
}

export const LangContext = createContext<LangContextValue>({
  lang: "pt-BR",
  setLang: () => {},
  t: (key) => translate(key, "pt-BR"),
});

export function useLang() {
  return useContext(LangContext);
}
