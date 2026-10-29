import { createRoot } from "react-dom/client";

import "./styles.css";
import "./review/mostek.css";
import "./review/prototype.css";
import "./review/host.css";
import "./review/comments.js";
import "./review/prototype.js";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);
