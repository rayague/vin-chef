import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Clients from "./pages/Clients"; // Users management (page file kept at pages/Clients.tsx)
import Sales from "./pages/Sales";
import Invoices from "./pages/Invoices";
import Categories from "./pages/Categories";
import Reports from "./pages/Reports";
import AuditLogs from "./pages/AuditLogs";
import RequireAdmin from './components/RequireAdmin';
import NotFound from "./pages/NotFound";
import Layout from "./components/Layout";
import Backups from "./pages/Backups";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route element={<Layout />}> 
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/products" element={<Products />} />
              <Route element={<RequireAdmin />}>
                <Route path="/clients" element={<Clients />} />
                <Route path="/backups" element={<Backups />} />
                <Route path="/audits" element={<AuditLogs />} />
              </Route>
              <Route path="/sales" element={<Sales />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/categories" element={<Categories />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
