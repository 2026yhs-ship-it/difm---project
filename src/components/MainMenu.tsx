interface MainMenuProps {
  onStart: () => void;
}

export function MainMenu({ onStart }: MainMenuProps) {
  return (
    <div className="main-menu">
      <h1 className="main-menu__title">⚽ HEADING SOCCER</h1>
      <p className="main-menu__sub">2D 아케이드 · 헤딩 중심 캐주얼</p>

      <button type="button" className="main-menu__btn" onClick={onStart}>
        게임 시작
      </button>

      <div className="main-menu__how">
        <h2>게임 방법</h2>
        <ul>
          <li><kbd>D</kbd> — 앞으로 가기</li>
          <li><kbd>A</kbd> — 뒤로 가기</li>
          <li><kbd>W</kbd> — 점프</li>
          <li><kbd>Space</kbd> — 헤딩</li>
          <li><kbd>R</kbd> — <strong>🔥 슈퍼킥</strong> (쿨다운)</li>
          <li><kbd>F</kbd> — 태클</li>
          <li><kbd>T</kbd> — <strong>⚡ 궁극기</strong> (쿨다운): 하늘에서 빛이 내려와 상대를 속박</li>
        </ul>
        <p>슈퍼킥·<kbd>T</kbd> 궁극기로 유리하게! 5골 먼저 달성하면 승리!</p>
      </div>
    </div>
  );
}
