import "./harden";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

// `npm run demo` replaces the Rust backend with made-up data (src/demo). The
// condition is false in every build, so the demo code is never bundled.
if (import.meta.env.MODE === "demo") {
  const { installDemoBackend } = await import("./demo/backend");
  installDemoBackend();
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
