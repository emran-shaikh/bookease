import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleProtectedRoute } from "@/components/RoleProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Courts from "./pages/Courts";
import CourtDetail from "./pages/CourtDetail";
import BookCourt from "./pages/BookCourt";
import Dashboard from "./pages/Dashboard";
import OwnerDashboard from "./pages/OwnerDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import CompleteProfile from "./pages/CompleteProfile";
import ReviewPage from "./pages/ReviewPage";
import Favorites from "./pages/Favorites";
import NotFound from "./pages/NotFound";
import ChatBot from "./components/ChatBot";
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/courts" element={<Courts />} />
            <Route path="/courts/:id" element={<CourtDetail />} />
            <Route
              path="/book/:id"
              element={
                <ProtectedRoute>
                  <BookCourt />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <RoleProtectedRoute allowedRole="customer">
                  <Dashboard />
                </RoleProtectedRoute>
              }
            />
            <Route
              path="/owner"
              element={
                <RoleProtectedRoute allowedRole="court_owner">
                  <OwnerDashboard />
                </RoleProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <RoleProtectedRoute allowedRole="admin">
                  <AdminDashboard />
                </RoleProtectedRoute>
              }
            />
            <Route
              path="/complete-profile"
              element={
                <ProtectedRoute>
                  <CompleteProfile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/review/:bookingId"
              element={
                <ProtectedRoute>
                  <ReviewPage />
                </ProtectedRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          <ChatBot />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
