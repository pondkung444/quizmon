import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.quizmon.app",
  appName: "QuizMon",
  server: {
    url: "https://quizmon.xyz",
    cleartext: false,
  },
};

export default config;
