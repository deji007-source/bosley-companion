import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ContextualTalk from "./ContextualTalk";
import "./styles.css";
createRoot(document.getElementById("root")!).render(<React.StrictMode><><App /><ContextualTalk /></></React.StrictMode>);
