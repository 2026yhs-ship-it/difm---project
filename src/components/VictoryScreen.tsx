import type { Winner } from '../game/types';

interface VictoryScreenProps {
  winner: Winner;
  playerScore: number;
  aiScore: number;
  onRestart: () => void;
  onMenu: () => void;
}

export function VictoryScreen({
  winner,
  playerScore,
  aiScore,
  onRestart,
  onMenu,
}: VictoryScreenProps) {
  const isPlayer = winner === 'player';
  const title = isPlayer ? '🎉 승리!' : '😅 패배';
  const sub = isPlayer
    ? `${playerScore} : ${aiScore} 로 우승했습니다.`
    : `${aiScore} : ${playerScore} 로 상대가 우승했습니다.`;

  return (
    <div className="victory">
      <h1 className="victory__title">{title}</h1>
      <p className="victory__score">{sub}</p>
      <div className="victory__actions">
        <button type="button" className="victory__btn" onClick={onRestart}>
          다시 하기
        </button>
        <button type="button" className="victory__btn victory__btn--outline" onClick={onMenu}>
          메인으로
        </button>
      </div>
    </div>
  );
}
