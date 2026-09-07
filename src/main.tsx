import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n";
import { Toaster } from "sonner";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
    <Toaster position="bottom-right" richColors />
  </React.StrictMode>,
);