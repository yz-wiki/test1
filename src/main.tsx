import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./styles/macos.css";
import App from "./App";
import { initLogging } from "./lib/log";
import { I18nProvider } from "./i18n";
import { applyMotionPref } from "./lib/uiPrefs";

// Attach devtools console to the unified log + emit a startup line. Fire-and-forget.
void initLogging();

// Stamp the reduced-motion preference before the first paint so the shell enters
// with the right animation policy instead of animating once and then stopping.
applyMotionPref();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* The provider sits above App so login/onboarding — which render outside the
        main shell — are translated too. */}
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);
