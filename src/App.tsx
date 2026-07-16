import { Route, Routes } from 'react-router-dom';
import { AuthBoundary } from './auth';
import { AppLayout } from './components/Layout';
import { Brief } from './pages/Brief';
import { Interview } from './pages/Interview';
import { Landing } from './pages/Landing';
import { Projects } from './pages/Projects';
import { Settings } from './pages/Settings';
import { Security } from './pages/Security';
import { AuthCallback } from './pages/AuthCallback';
import { NotionCallback } from './pages/NotionCallback';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/notion/callback" element={<NotionCallback />} />
      <Route
        element={
          <AuthBoundary>
            <AppLayout />
          </AuthBoundary>
        }
      >
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id/interview" element={<Interview />} />
        <Route path="/projects/:id/brief" element={<Brief />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/security" element={<Security />} />
      </Route>
      <Route path="*" element={<Landing />} />
    </Routes>
  );
}
