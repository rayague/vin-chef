import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initializeDemoData } from "./lib/storage";

// Initialize demo data
if (import.meta.env.DEV) {
	// Force demo data in development to make testing simple
	initializeDemoData(true);
} else {
	initializeDemoData();
}

createRoot(document.getElementById("root")!).render(<App />);
