import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('html2canvas')) return 'vendor_html2canvas';
            if (id.includes('jspdf') || id.includes('jspdf-autotable')) return 'vendor_jspdf';
            if (id.includes('recharts')) return 'vendor_recharts';
            if (id.includes('lucide-react')) return 'vendor_icons';
            if (id.includes('react') || id.includes('react-dom')) return 'vendor_react';
          }
        }
      }
    }
  }
}));
