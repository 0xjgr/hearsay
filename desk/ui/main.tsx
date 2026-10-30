import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/600.css";
import "./desk.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DeskScreen } from "./desk-screen.tsx";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html lost its #root");
createRoot(root).render(
  <StrictMode>
    <DeskScreen />
  </StrictMode>,
);
