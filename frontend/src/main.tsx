import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
// Dark media-platform theme, scoped to `.creator-root` only.
import "./styles/creator.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
