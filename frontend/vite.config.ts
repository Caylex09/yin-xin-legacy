import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";

// 获取当前 git 提交的短 hash
let gitCommitHash = "unknown";
try {
  gitCommitHash = execSync("git rev-parse --short HEAD").toString().trim();
} catch (e) {
  console.warn("Failed to get git commit hash", e);
}

export default defineConfig({
  plugins: [react()],
  define: {
    __GIT_COMMIT_HASH__: JSON.stringify(gitCommitHash),
  },
});

