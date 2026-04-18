import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import Hub from "./pages/Hub.tsx";
import Lobby from "./pages/Lobby.tsx";
import Match from "./pages/Match.tsx";
import Leaderboard from "./pages/Leaderboard.tsx";
import Profile from "./pages/Profile.tsx";
import Shop from "./pages/Shop.tsx";
import Admin from "./pages/Admin.tsx";
import AdminLogin from "./pages/AdminLogin.tsx";
import NotFound from "./pages/NotFound.tsx";
import ChessLobby from "./pages/chess/ChessLobby.tsx";
import ChessMatch from "./pages/chess/ChessMatch.tsx";
import CarromLobby from "./pages/carrom/CarromLobby.tsx";
import CarromMatch from "./pages/carrom/CarromMatch.tsx";
import ComingSoon from "./pages/ComingSoon.tsx";

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
            <Route path="/login" element={<Auth mode="login" />} />
            <Route path="/signup" element={<Auth mode="signup" />} />
            <Route path="/hub" element={<ProtectedRoute><Hub /></ProtectedRoute>} />
            <Route path="/lobby" element={<ProtectedRoute><Lobby /></ProtectedRoute>} />
            <Route path="/match/:matchId" element={<ProtectedRoute><Match /></ProtectedRoute>} />
            <Route path="/chess/lobby" element={<ProtectedRoute><ChessLobby /></ProtectedRoute>} />
            <Route path="/chess/play" element={<ProtectedRoute><ChessMatch /></ProtectedRoute>} />
            <Route path="/carrom/lobby" element={<ProtectedRoute><CarromLobby /></ProtectedRoute>} />
            <Route path="/carrom/play" element={<ProtectedRoute><CarromMatch /></ProtectedRoute>} />
            <Route path="/pool/lobby" element={<ProtectedRoute><ComingSoon title="8-Ball Pool" description="Classic billiards with cue spin, fouls, and full 8-ball rules." /></ProtectedRoute>} />
            <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/shop" element={<ProtectedRoute><Shop /></ProtectedRoute>} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
