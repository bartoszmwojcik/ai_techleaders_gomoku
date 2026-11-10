import type { Translation } from "../types";

const header: Translation<"header"> = {
  theme: {
    light: "Light theme",
    dark: "Dark theme",
  },
  language: {
    menuLabel: "Language: {language}, change language",
  },
  session: {
    menuLabel: "Signed in as {name}, account menu",
    account: "Account",
    history: "History",
    logout: "Log out",
  },
  logout: {
    title: "Log out?",
    gameRunning: "A game is in progress — after you log out, your clock keeps running. Log out?",
    gameUnknown: "We could not check whether a game is in progress. If it is, your clock keeps running after you log out. Log out?",
    confirm: "Log out",
    cancel: "Stay signed in",
    failed: "Could not log out. Try again.",
    failedTitle: "Could not log out",
    failedRetry: "Try again.",
  },
};

export default header;
