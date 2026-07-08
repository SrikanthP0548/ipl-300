import { HashRouter, Route, Routes } from 'react-router-dom';
import { GameProvider } from './GameContext';
import { Home } from './pages/Home';
import { BuildXI } from './pages/BuildXI';
import { Chase } from './pages/Chase';
import { Result } from './pages/Result';

function App() {
  return (
    <GameProvider>
      <HashRouter>
        <div className="app-shell">
          <div className="floodlights" />
          <div className="dot-texture" />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/build" element={<BuildXI />} />
            <Route path="/chase" element={<Chase />} />
            <Route path="/result" element={<Result />} />
          </Routes>
        </div>
      </HashRouter>
    </GameProvider>
  );
}

export default App;
