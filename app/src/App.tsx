import { HashRouter, Route, Routes } from 'react-router-dom';
import { GameProvider } from './GameContext';
import { ThemeProvider } from './ThemeContext';
import { ThemeToggle } from './components/ThemeToggle';
import { Home } from './pages/Home';
import { BuildXI } from './pages/BuildXI';
import { Chase } from './pages/Chase';
import { Result } from './pages/Result';
import { Leaderboard } from './pages/Leaderboard';

function App() {
  return (
    <ThemeProvider>
      <GameProvider>
        <HashRouter>
          <div className="app-shell">
            <div className="floodlights" />
            <div className="dot-texture" />
            <ThemeToggle />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/build" element={<BuildXI />} />
              <Route path="/chase" element={<Chase />} />
              <Route path="/result" element={<Result />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
            </Routes>
          </div>
        </HashRouter>
      </GameProvider>
    </ThemeProvider>
  );
}

export default App;
