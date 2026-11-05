import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/source-serif-4/400-italic.css";
import "@fontsource/source-serif-4/600.css";
import "@fontsource/source-serif-4/600-italic.css";
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
