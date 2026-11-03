import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./styles/macos.css";
import App from "./App";
import { initLogging } from "./lib/log";
import { I18nProvider } from "./i18n";

// Attach devtools console to the unified log + emit a startup line. Fire-and-forget.
void initLogging();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* The provider sits above App so login/onboarding — which render outside the
        main shell — are translated too. */}
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);
