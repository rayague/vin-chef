import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initializeDemoData, seedWineCatalog } from "./lib/storage";

// Initialize demo data
if (import.meta.env.DEV) {
	// In DEV, only seed demo data if no users exist yet.
	// Never overwrite existing users, otherwise credentials changes are lost.
	try {
		const raw = localStorage.getItem('winecellar_users') || '[]';
		const users = JSON.parse(raw);
		const hasAnyUser = Array.isArray(users) && users.length > 0;
		if (!hasAnyUser) initializeDemoData(true);
	} catch {
		initializeDemoData(true);
	}
} else {
	initializeDemoData();
}

seedWineCatalog();

createRoot(document.getElementById("root")!).render(<App />);
