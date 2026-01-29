import { useCallback, useState } from 'react';
import { BGM } from './components/BGM';
import { Game, type GameResult } from './components/Game';
import { MainMenu } from './components/MainMenu';
import { VictoryScreen } from './components/VictoryScreen';
import type { GamePhase, Winner } from './game/types';
import './App.css';

function App() {
  const [phase, setPhase] = useState<GamePhase>('main');
  const [winner, setWinner] = useState<Winner>(null);
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [bgmVolume, setBgmVolume] = useState(0.7);
  const handleStart = useCallback(() => {
    setPhase('playing');
    setWinner(null);
    setPlayerScore(0);
    setAiScore(0);
  }, []);

  const handleVictory = useCallback((r: GameResult) => {
    setWinner(r.winner);
    setPlayerScore(r.playerScore);
    setAiScore(r.aiScore);
    setPhase('victory');
  }, []);

  const handleRestart = useCallback(() => {
    setPhase('playing');
    setWinner(null);
    setPlayerScore(0);
    setAiScore(0);
  }, []);

  const handleMenu = useCallback(() => {
    setPhase('main');
    setWinner(null);
    setPlayerScore(0);
    setAiScore(0);
  }, []);

  return (
    <div className="app">
      <BGM volume={bgmVolume} />
      {phase === 'main' && <MainMenu onStart={handleStart} />}
      {phase === 'playing' && (
        <Game
          onVictory={handleVictory}
          onQuit={handleMenu}
          bgmVolume={bgmVolume}
          onBgmVolumeChange={setBgmVolume}
        />
      )}
      {phase === 'victory' && (
        <VictoryScreen
          winner={winner}
          playerScore={playerScore}
          aiScore={aiScore}
          onRestart={handleRestart}
          onMenu={handleMenu}
        />
      )}
    </div>
  );
}

export default App;
