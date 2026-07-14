import { Route, Routes } from 'react-router-dom';
import { AuthBoundary } from './auth';
import { AppLayout } from './components/Layout';
import { Brief } from './pages/Brief';
import { Interview } from './pages/Interview';
import { Landing } from './pages/Landing';
import { Projects } from './pages/Projects';
import { Settings } from './pages/Settings';

export function App({ localMode }: { localMode: boolean }) {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        element={
          <AuthBoundary localMode={localMode}>
            <AppLayout localMode={localMode} />
          </AuthBoundary>
        }
      >
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id/interview" element={<Interview />} />
        <Route path="/projects/:id/brief" element={<Brief />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Landing />} />
    </Routes>
  );
}
