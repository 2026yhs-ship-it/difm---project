import { useCallback, useEffect, useRef, useState } from 'react';
import type { Ball, Entity, Keys, Winner } from '../game/types';
import {
  AI_REACTION,
  AI_SPEED,
  AI_START_X,
  AI_JUMP_CHANCE,
  BALL_BOUNCE,
  BALL_FRICTION,
  BALL_GRAVITY,
  BALL_R,
  BALL_RESET_X,
  BALL_RESET_Y,
  CANVAS_H,
  CANVAS_W,
  DT,
  GOAL_BOTTOM,
  GOAL_DEPTH,
  GOAL_LEFT,
  GOAL_RIGHT,
  GOAL_TOP,
  FIELD_TOP,
  GROUND_Y,
  SCOREBOARD_H,
  SCOREBOARD_W,
  SCOREBOARD_Y,
  STAND_HEIGHT,
  HEADING_FORCE,
  HEADING_H_FORCE,
  HEADING_RANGE,
  PLAYER_H,
  PLAYER_HEAD_R,
  PLAYER_JUMP,
  PLAYER_SPEED,
  PLAYER_START_X,
  PLAYER_W,
  SHOT_FORCE,
  TACKLE_RANGE,
  WIN_SCORE,
  SUPER_KICK_FORCE,
  SUPER_KICK_COOLDOWN,
  SUPER_KICK_RANGE,
  ULTIMATE_COOLDOWN,
  AI_BOUND_DURATION,
} from '../game/constants';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type?: 'fire' | 'spark';
}

interface ImpactRing {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
}

interface ImpactFlash {
  x: number;
  y: number;
  life: number;
}

function createBall(): Ball {
  return { x: BALL_RESET_X, y: BALL_RESET_Y, vx: 0, vy: 0, radius: BALL_R };
}

function createEntity(x: number): Entity {
  return {
    x,
    y: GROUND_Y - PLAYER_H,
    vx: 0,
    vy: 0,
    w: PLAYER_W,
    h: PLAYER_H,
    headRadius: PLAYER_HEAD_R,
  };
}

function onGround(e: Entity): boolean {
  return e.y + e.h >= GROUND_Y - 2;
}

function headY(e: Entity): number {
  return e.y - e.headRadius + 4;
}

function ballNearHead(b: Ball, e: Entity): boolean {
  const dx = b.x - (e.x + e.w / 2);
  const dy = b.y - headY(e);
  return Math.abs(dx) < HEADING_RANGE && Math.abs(dy) < HEADING_RANGE * 1.2;
}

function ballInRange(b: Ball, e: Entity, r: number): boolean {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  return Math.hypot(b.x - cx, b.y - cy) < r;
}

export interface GameResult {
  winner: Winner;
  playerScore: number;
  aiScore: number;
}

interface GameProps {
  onVictory: (r: GameResult) => void;
  onQuit?: () => void;
  bgmVolume?: number;
  onBgmVolumeChange?: (v: number) => void;
}

export function Game({ onVictory, onQuit, bgmVolume = 0.7, onBgmVolumeChange }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [running, setRunning] = useState(true);
  const [paused, setPaused] = useState(false);

  const ballRef = useRef<Ball>(createBall());
  const ballPrevPosRef = useRef<{ x: number; y: number }>({ x: BALL_RESET_X, y: BALL_RESET_Y });
  const playerRef = useRef<Entity>(createEntity(PLAYER_START_X));
  const aiRef = useRef<Entity>(createEntity(AI_START_X));
  const playerScoreRef = useRef(0);
  const aiScoreRef = useRef(0);
  const keysRef = useRef<Keys>({ w: false, a: false, d: false, space: false, r: false, f: false, t: false });

  const spaceUsedRef = useRef(false);
  const fUsedRef = useRef(false);
  const resetTimerRef = useRef(0);

  // 슈퍼킥 쿨다운
  const playerSuperCooldownRef = useRef(0);
  const aiSuperCooldownRef = useRef(0);
  const aiActionCooldownRef = useRef(0);

  // 파티클 (불꽃·스파클 이펙트)
  const particlesRef = useRef<Particle[]>([]);
  const superKickActiveRef = useRef(false);
  const superKickFlashRef = useRef<ImpactFlash | null>(null);
  const superKickRingsRef = useRef<ImpactRing[]>([]);
  const screenFlashRef = useRef(0);
  const screenFlashSecondRef = useRef(false);

  // AI 패턴 다양화를 위한 상태
  const aiPatternRef = useRef(0); // 0: 수비, 1: 공격, 2: 중립, 3: 돌진, 4: 대기, 5: 예측
  const aiLastActionRef = useRef(0);
  const aiStrategyTimerRef = useRef(0); // 전략 변경 타이머
  const aiBehaviorSeedRef = useRef(Math.random()); // 행동 패턴 시드
  const aiPositionMemoryRef = useRef<{ x: number; y: number; time: number }[]>([]); // 공 위치 기록
  const aiLastPatternRef = useRef(-1); // 이전 패턴 (반복 방지)
  const aiPatternVariationRef = useRef(0); // 패턴 변형 (0-5)
  
  // 공이 캐릭터에게 붙어있는 시간 추적 (0.7초 = 42프레임)
  const ballStuckToPlayerRef = useRef(0);
  const ballStuckToAiRef = useRef(0);

  // 궁극기 (T) — 하늘에서 반짝이며 내려와 상대 속박
  const ultimateCooldownRef = useRef(0);
  const aiBoundRef = useRef(0);
  const ultimateUsedRef = useRef(false);
  interface UltimateSpark {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
    color: string;
  }
  interface UltimateFalling {
    y: number;
    targetAx: number;
    targetAy: number;
    sparks: UltimateSpark[];
  }
  const ultimateFallingRef = useRef<UltimateFalling | null>(null);
  const ultimateImpactRef = useRef(0); // 속박 적중 시 짧은 플래시

  // 세리머니 (골 시 화면 돌리기 + 득점자 확대)
  const celebrationRef = useRef<{ active: boolean; progress: number; target: 'player' | 'ai'; duration: number; message: string }>({
    active: false,
    progress: 0,
    target: 'player',
    duration: 120,
    message: '',
  });

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    // ESC로 일시정지
    if (e.key === 'Escape') {
      e.preventDefault();
      setPaused((prev) => !prev);
      return;
    }
    if (k === ' ') { e.preventDefault(); keysRef.current.space = true; }
    if (k === 'w') keysRef.current.w = true;
    if (k === 'a') keysRef.current.a = true;
    if (k === 'd') keysRef.current.d = true;
    if (k === 'r') keysRef.current.r = true;
    if (k === 'f') keysRef.current.f = true;
    if (k === 't') keysRef.current.t = true;
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === ' ') { keysRef.current.space = false; spaceUsedRef.current = false; }
    if (k === 'w') keysRef.current.w = false;
    if (k === 'a') keysRef.current.a = false;
    if (k === 'd') keysRef.current.d = false;
    if (k === 'r') keysRef.current.r = false;
    if (k === 'f') keysRef.current.f = false;
    if (k === 't') { keysRef.current.t = false; ultimateUsedRef.current = false; }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !running) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId: number;
    let last = performance.now();
    let acc = 0;

    function spawnFireParticles(x: number, y: number, dir: number) {
      for (let i = 0; i < 12; i++) {
        particlesRef.current.push({
          x: x + (Math.random() - 0.5) * 20,
          y: y + (Math.random() - 0.5) * 20,
          vx: -dir * (2 + Math.random() * 3),
          vy: (Math.random() - 0.5) * 3,
          life: 25 + Math.random() * 15,
          maxLife: 40,
          size: 6 + Math.random() * 8,
          color: Math.random() > 0.5 ? '#ff6b35' : '#ffc300',
          type: 'fire',
        });
      }
    }

    function spawnSuperKickImpact(x: number, y: number, dir: number) {
      // 순간 플래시 (반짝임)
      superKickFlashRef.current = { x, y, life: 8 };

      // 확장 링 3개 (딜레이 차이로 파동 효과)
      for (let i = 0; i < 3; i++) {
        superKickRingsRef.current.push({
          x,
          y,
          radius: 5 + i * 8,
          life: 18 - i * 4,
          maxLife: 18 - i * 4,
        });
      }

      // 불꽃 대량 발생
      for (let i = 0; i < 18; i++) {
        const angle = (-dir * 0.4 + (Math.random() - 0.5) * 1.2) * Math.PI;
        const speed = 3 + Math.random() * 6;
        particlesRef.current.push({
          x: x + (Math.random() - 0.5) * 24,
          y: y + (Math.random() - 0.5) * 24,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2,
          life: 20 + Math.random() * 25,
          maxLife: 45,
          size: 8 + Math.random() * 10,
          color: ['#ff6b35', '#ffc300', '#ffaa00', '#fff3b0', '#ffffff'][Math.floor(Math.random() * 5)],
          type: 'fire',
        });
      }

      // 스파클 (반짝이) — 전방위로 터짐
      for (let i = 0; i < 28; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 10;
        particlesRef.current.push({
          x: x + (Math.random() - 0.5) * 16,
          y: y + (Math.random() - 0.5) * 16,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 8 + Math.random() * 12,
          maxLife: 20,
          size: 2 + Math.random() * 4,
          color: ['#ffffff', '#fffacd', '#ffd700', '#ffec8b', '#ffe4b5'][Math.floor(Math.random() * 5)],
          type: 'spark',
        });
      }
    }

    function goalScored(side: 'left' | 'right') {
      spaceUsedRef.current = false;
      fUsedRef.current = false;
      aiBoundRef.current = 0;
      ultimateFallingRef.current = null;
      ultimateImpactRef.current = 0;
      if (side === 'right') {
        playerScoreRef.current += 1;
        if (playerScoreRef.current >= WIN_SCORE) {
          setRunning(false);
          onVictory({ winner: 'player', playerScore: playerScoreRef.current, aiScore: aiScoreRef.current });
          return;
        }
      } else {
        aiScoreRef.current += 1;
        if (aiScoreRef.current >= WIN_SCORE) {
          setRunning(false);
          onVictory({ winner: 'ai', playerScore: playerScoreRef.current, aiScore: aiScoreRef.current });
          return;
        }
      }
      // 세리머니: 화면 돌리기 + 득점자 확대 (끝나면 리셋 타이머 시작)
      const totalGoals = playerScoreRef.current + aiScoreRef.current;
      const CELEB_TEXTS = ['이동훈 대표님 화이팅!!', '전북인공지능고등학교 화이팅!!', '유혜성 개존잘 화이팅!!'];
      const celebMessage = totalGoals <= 3
        ? CELEB_TEXTS[totalGoals - 1]
        : CELEB_TEXTS[(totalGoals - 1) % 3];
      celebrationRef.current = {
        active: true,
        progress: 0,
        target: side === 'right' ? 'player' : 'ai',
        duration: 120,
        message: celebMessage,
      };
    }

    function resetBall() {
      const b = ballRef.current;
      b.x = BALL_RESET_X;
      b.y = BALL_RESET_Y;
      b.vx = 0;
      b.vy = 0;
      superKickActiveRef.current = false;
      aiBoundRef.current = 0;
      ultimateFallingRef.current = null;
      ultimateImpactRef.current = 0;
      const player = playerRef.current;
      const ai = aiRef.current;
      player.x = PLAYER_START_X;
      player.y = GROUND_Y - PLAYER_H;
      player.vx = 0;
      player.vy = 0;
      ai.x = AI_START_X;
      ai.y = GROUND_Y - PLAYER_H;
      ai.vx = 0;
      ai.vy = 0;
    }

    function tick() {
      if (paused) return;

      // 세리머니 중: 화면만 돌리고, 끝나면 리셋 타이머 시작
      if (celebrationRef.current.active) {
        celebrationRef.current.progress += 1 / celebrationRef.current.duration;
        if (celebrationRef.current.progress >= 1) {
          celebrationRef.current.active = false;
          resetTimerRef.current = 50;
        }
        return;
      }

      const ball = ballRef.current;
      const player = playerRef.current;
      const ai = aiRef.current;
      const keys = keysRef.current;

      // 쿨다운 감소
      if (playerSuperCooldownRef.current > 0) playerSuperCooldownRef.current--;
      if (aiSuperCooldownRef.current > 0) aiSuperCooldownRef.current--;
      if (aiActionCooldownRef.current > 0) aiActionCooldownRef.current--;
      if (ultimateCooldownRef.current > 0) ultimateCooldownRef.current--;
      if (aiBoundRef.current > 0) aiBoundRef.current--;
      if (ultimateImpactRef.current > 0) ultimateImpactRef.current--;
      if (aiLastActionRef.current > 0) aiLastActionRef.current--;

      // 리셋 타이머
      if (resetTimerRef.current > 0) {
        resetTimerRef.current--;
        resetBall();
        return;
      }

      // 파티클 업데이트
      particlesRef.current = particlesRef.current.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        p.size *= p.type === 'spark' ? 0.92 : 0.96;
        return p.life > 0;
      });

      // 슈퍼킥 플래시·링 업데이트
      if (superKickFlashRef.current) {
        superKickFlashRef.current.life--;
        if (superKickFlashRef.current.life <= 0) superKickFlashRef.current = null;
      }
      superKickRingsRef.current = superKickRingsRef.current.filter((r) => {
        r.radius += 7;
        r.life--;
        return r.life > 0;
      });

      // 슈퍼킥 활성 시 불꽃 트레일
      if (superKickActiveRef.current && Math.hypot(ball.vx, ball.vy) > 15) {
        spawnFireParticles(ball.x, ball.y, ball.vx > 0 ? 1 : -1);
      } else if (Math.hypot(ball.vx, ball.vy) < 10) {
        superKickActiveRef.current = false;
      }

      // 궁극기 (T) 발동 — 하늘에서 반짝이며 내려와 상대 속박
      if (keys.t && ultimateCooldownRef.current <= 0 && !ultimateUsedRef.current) {
        ultimateUsedRef.current = true;
        ultimateCooldownRef.current = ULTIMATE_COOLDOWN;
        const ax = ai.x + ai.w / 2;
        const ay = ai.y + ai.h / 2;
        ultimateFallingRef.current = { y: FIELD_TOP - 80, targetAx: ax, targetAy: ay, sparks: [] };
      }
      // 궁극기 낙하 이펙트 업데이트
      if (ultimateFallingRef.current) {
        const u = ultimateFallingRef.current;
        u.y += 11;
        for (let i = 0; i < 10; i++) {
          u.sparks.push({
            x: u.targetAx + (Math.random() - 0.5) * 100,
            y: u.y + (Math.random() - 0.5) * 30,
            vx: (Math.random() - 0.5) * 4,
            vy: 2 + Math.random() * 4,
            life: 22 + Math.random() * 28,
            maxLife: 50,
            size: 6 + Math.random() * 10,
            color: ['#fff', '#ffd700', '#ffeb3b', '#fff59d', '#ffe082', '#ffc107', '#fff8e1'][Math.floor(Math.random() * 7)],
          });
        }
        u.sparks = u.sparks.filter((s) => {
          s.x += s.vx;
          s.y += s.vy;
          s.life--;
          return s.life > 0;
        });
        if (u.y >= u.targetAy + 50) {
          aiBoundRef.current = AI_BOUND_DURATION;
          ultimateFallingRef.current = null;
          ultimateImpactRef.current = 25; // 속박 적중 시 간지 플래시
        }
      }

      // 공의 이전 위치 저장 (관통 방지용)
      ballPrevPosRef.current.x = ball.x;
      ballPrevPosRef.current.y = ball.y;
      
      // 공 물리
      ball.vy += BALL_GRAVITY;
      ball.vx *= BALL_FRICTION;
      ball.vy *= BALL_FRICTION;
      ball.x += ball.vx;
      ball.y += ball.vy;

      // 바운드 - 바닥
      if (ball.y + ball.radius >= GROUND_Y) {
        ball.y = GROUND_Y - ball.radius;
        ball.vy *= -BALL_BOUNCE;
        ball.vx *= 0.95;
      }
      // 바운드 - 위쪽 벽
      if (ball.y - ball.radius <= FIELD_TOP + 10) {
        ball.y = FIELD_TOP + 10 + ball.radius;
        ball.vy *= -BALL_BOUNCE;
      }
      // 바운드 - 좌측 벽
      if (ball.x - ball.radius <= 0) {
        ball.x = ball.radius;
        ball.vx *= -BALL_BOUNCE;
        // 튕김 시 약간의 에너지 보존
        if (Math.abs(ball.vx) < 1) {
          ball.vx = ball.vx > 0 ? 1 : -1;
        }
      }
      // 바운드 - 우측 벽
      if (ball.x + ball.radius >= CANVAS_W) {
        ball.x = CANVAS_W - ball.radius;
        ball.vx *= -BALL_BOUNCE;
        // 튕김 시 약간의 에너지 보존
        if (Math.abs(ball.vx) < 1) {
          ball.vx = ball.vx > 0 ? 1 : -1;
        }
      }

      // 골 체크
      if (ball.x - ball.radius <= GOAL_DEPTH && ball.y >= GOAL_TOP && ball.y <= GOAL_BOTTOM) {
        goalScored('left');
        return;
      }
      if (ball.x + ball.radius >= GOAL_RIGHT - GOAL_DEPTH && ball.y >= GOAL_TOP && ball.y <= GOAL_BOTTOM) {
        goalScored('right');
        return;
      }

      // 플레이어 이동 (보간으로 부드럽게)
      const targetPlayerVx = keys.a ? -PLAYER_SPEED : keys.d ? PLAYER_SPEED : 0;
      player.vx += (targetPlayerVx - player.vx) * 0.28;

      if (keys.w && onGround(player)) player.vy = PLAYER_JUMP;
      player.vy += 0.6;
      player.x += player.vx;
      player.y += player.vy;
      if (player.y + player.h >= GROUND_Y) {
        player.y = GROUND_Y - player.h;
        player.vy = 0;
      }
      player.x = Math.max(20, Math.min(CANVAS_W - 20 - player.w, player.x));

      // 플레이어 헤딩 (Space)
      if (keys.space && !spaceUsedRef.current && ballNearHead(ball, player)) {
        spaceUsedRef.current = true;
        const dir = keys.d ? 1 : keys.a ? -1 : 1;
        ball.vy = HEADING_FORCE;
        ball.vx += HEADING_H_FORCE * dir;
      }

      // 플레이어 슈퍼킥 (R) — 임팩트 이펙트 + 쿨다운
      if (keys.r && playerSuperCooldownRef.current <= 0 && ballInRange(ball, player, SUPER_KICK_RANGE)) {
        playerSuperCooldownRef.current = SUPER_KICK_COOLDOWN;
        // AI처럼 골대 방향으로 정확히 차기
        const goalX = GOAL_RIGHT - GOAL_DEPTH;
        const goalY = (GOAL_TOP + GOAL_BOTTOM) / 2;
        const toGoalX = goalX - ball.x;
        const toGoalY = goalY - ball.y;
        const toGoalDist = Math.hypot(toGoalX, toGoalY);
        const toGoalNx = toGoalX / toGoalDist;
        const toGoalNy = toGoalY / toGoalDist;
        
        ball.vx = SUPER_KICK_FORCE * toGoalNx * (0.95 + Math.random() * 0.05);
        ball.vy = SUPER_KICK_FORCE * toGoalNy * (0.95 + Math.random() * 0.05) - 1.5;
        superKickActiveRef.current = true;
        spawnSuperKickImpact(ball.x, ball.y, toGoalNx > 0 ? 1 : -1);
        screenFlashRef.current = 1;
        screenFlashSecondRef.current = false;
      }

      // 플레이어 태클 (F)
      if (keys.f && !fUsedRef.current && ballInRange(ball, player, TACKLE_RANGE)) {
        fUsedRef.current = true;
        const dx = ball.x - (player.x + player.w / 2);
        ball.vx += (dx > 0 ? 1 : -1) * SHOT_FORCE * 0.7;
        ball.vy -= 4;
      }
      if (!keys.f) fUsedRef.current = false;

      // AI 이동 (똑똑한 전략)
      const ax = ai.x + ai.w / 2;
      const ay = ai.y + ai.h / 2;
      const diffX = ball.x - ax;
      const diffY = ball.y - ay;
      const ballDist = Math.hypot(diffX, diffY);
      const px = player.x + player.w / 2;
      const py = player.y + player.h / 2;
      const playerDist = Math.hypot(ball.x - px, ball.y - py);

      if (aiBoundRef.current > 0) {
        ai.vx = 0;
        ai.vy = 0;
      } else {
      // 공 위치 기록 (예측용)
      aiPositionMemoryRef.current.push({ x: ball.x, y: ball.y, time: Date.now() });
      if (aiPositionMemoryRef.current.length > 10) {
        aiPositionMemoryRef.current.shift();
      }
      
      // 공의 예상 위치 계산 (고수 수준 - 매우 정확)
      let predictedBallX = ball.x;
      let predictedBallY = ball.y;
      if (aiPositionMemoryRef.current.length >= 3) {
        const recent = aiPositionMemoryRef.current.slice(-3);
        // 현재 속도와 가속도 모두 고려
        const vx = recent[2].x - recent[0].x;
        const vy = recent[2].y - recent[0].y;
        const currentVx = ball.vx;
        const currentVy = ball.vy;
        
        // 더 정확한 예측 (속도와 위치 기록 모두 사용)
        const avgVx = (vx + currentVx) / 2;
        const avgVy = (vy + currentVy) / 2;
        
        // 중력과 마찰 고려한 예측
        const timeToReach = Math.abs(diffX) / (Math.abs(avgVx) + 0.1);
        const frictionFactor = Math.pow(BALL_FRICTION, timeToReach * 60);
        
        predictedBallX = ball.x + avgVx * timeToReach * frictionFactor;
        predictedBallY = ball.y + avgVy * timeToReach + BALL_GRAVITY * timeToReach * timeToReach * 0.5;
        
        // 플레이어의 움직임도 예측 (공을 향해 올 때)
        if (player.vx !== 0 || player.vy !== 0) {
          const playerToBallX = ball.x - px;
          const playerToBallY = ball.y - py;
          const playerMovingToBall = (player.vx * playerToBallX + player.vy * playerToBallY) > 0;
          if (playerMovingToBall && playerDist < 100) {
            // 플레이어가 공을 향해 오면 더 앞서서 예측
            predictedBallX += player.vx * 0.3;
          }
        }
      }
      
      // 상황 분석
      const ballOnAiSide = ball.x > CANVAS_W / 2;
      const ballOnPlayerSide = ball.x < CANVAS_W / 2;
      const ballMovingToPlayerGoal = ball.vx < -5 && ball.x < CANVAS_W / 2; // 플레이어 골대로
      const ballMovingToAiGoal = ball.vx > 1 && ball.x > CANVAS_W / 2; // AI 골대로 (수비 스택: 더 민감)
      const ballNearPlayerGoal = ball.x < 200 && ball.y > GOAL_TOP && ball.y < GOAL_BOTTOM;
      const ballNearAiGoal = ball.x > CANVAS_W - 350 && ball.y > GOAL_TOP - 60 && ball.y < GOAL_BOTTOM + 60; // AI 골대 근처 (수비 스택: 구역 확대)
      const ballOnAiHalf = ball.x > CANVAS_W / 2; // AI 쪽이면 무조건 플레이어 골대로만
      const ballVeryNearAiGoal = ball.x > CANVAS_W - 250; // 이 구역에서 슈퍼킥 금지, 수비만 (수비 스택: 구역 확대)
      const playerHasBall = playerDist < 60;
      const aiHasBall = ballDist < 60;
      
      // 공이 빠르게 플레이어 골대로 올 때 (게임 시작 직후 대응)
      const ballSpeed = Math.hypot(ball.vx, ball.vy);
      const fastBallToGoal = ballSpeed > 12 && ball.vx < -3 && ball.x < CANVAS_W / 2 + 100;
      const ballInCenter = Math.abs(ball.x - CANVAS_W / 2) < 150;
      
      // 패턴 다양화 (너무 자주 바꾸면 지지직거리므로 적당히)
      aiStrategyTimerRef.current--;
      if (aiStrategyTimerRef.current <= 0) {
        aiStrategyTimerRef.current = 18 + Math.random() * 24; // 0.3~0.7초마다 변경
        const availablePatterns = [0, 1, 2, 3, 4, 5].filter(p => p !== aiLastPatternRef.current);
        aiPatternRef.current = availablePatterns[Math.floor(Math.random() * availablePatterns.length)];
        aiLastPatternRef.current = aiPatternRef.current;
        aiPatternVariationRef.current = Math.floor(Math.random() * 6);
        aiBehaviorSeedRef.current = Math.random();
      }
      
      // 전략: 기본은 그냥 공 따라가기, 수비/공격 상황에서만 특수 동작 (수비·공격 디지게 잘하게)
      let targetX = predictedBallX; // 기본 = 공 예상 위치 추격
      let moveSpeed = AI_SPEED * 1.5; // 공 따라갈 때 빠르게
      
      // [수비] AI 골대 위험 → 골대 앞 수비 (디지게 잘)
      if (ballNearAiGoal || ballMovingToAiGoal || ballVeryNearAiGoal) {
        const aiGoalX = GOAL_RIGHT - GOAL_DEPTH - 30;
        const interceptY = ball.y + ball.vy * 8;
        targetX = aiGoalX;
        if (interceptY > GOAL_TOP - 20 && interceptY < GOAL_BOTTOM + 20) {
          const goalCenterY = (GOAL_TOP + GOAL_BOTTOM) / 2;
          targetX = aiGoalX + (interceptY - goalCenterY) * 0.3;
        }
        moveSpeed = AI_SPEED * 1.9;
      }
      // [수비] 우리 골대 위험 — 빠른 공/다가오는 공 즉시 인터셉트 (디지게 잘)
      else if (fastBallToGoal || (ballSpeed > 8 && ball.vx < -3 && ball.x < CANVAS_W / 2 + 200)) {
        const goalX = GOAL_DEPTH + 20;
        const interceptTime = Math.max(0, (goalX - ball.x) / (ball.vx + 0.1));
        const interceptY = ball.y + ball.vy * interceptTime + BALL_GRAVITY * interceptTime * interceptTime * 0.5;
        targetX = goalX;
        if (interceptY > GOAL_TOP - 30 && interceptY < GOAL_BOTTOM + 30) {
          const goalCenterY = (GOAL_TOP + GOAL_BOTTOM) / 2;
          targetX = goalX + (interceptY - goalCenterY) * 0.5;
        }
        moveSpeed = AI_SPEED * 1.85;
      }
      else if (ballMovingToPlayerGoal || ballNearPlayerGoal || (ball.vx < -2 && ball.x < 350)) {
        const goalX = GOAL_DEPTH + 25;
        const interceptTime = (goalX - ball.x) / (ball.vx + 0.1);
        const interceptY = ball.y + ball.vy * interceptTime + BALL_GRAVITY * interceptTime * interceptTime * 0.5;
        targetX = goalX;
        if (interceptY > GOAL_TOP - 20 && interceptY < GOAL_BOTTOM + 20) {
          const goalCenterY = (GOAL_TOP + GOAL_BOTTOM) / 2;
          targetX = goalX + (interceptY - goalCenterY) * 0.4;
        }
        moveSpeed = AI_SPEED * 1.6;
      }
      // 그 외 전부: 그냥 공 따라가기 (예상 위치로 빠르게)
      else {
        targetX = predictedBallX;
        if (ballDist < 50) targetX = ball.x;
        moveSpeed = AI_SPEED * 1.5;
      }
      
      if (ballDist < 25 && ball.x > CANVAS_W / 2) {
        targetX = ball.x - 40;
        moveSpeed = AI_SPEED * 1.5;
      }
      
      // 이동 실행 — 목표 속도로 부드럽게 보간 (지지직거림 방지)
      const moveDiff = targetX - ax;
      const distToTarget = Math.abs(moveDiff);
      const toBall = ball.x - ax;
      const aiGoalX = GOAL_RIGHT - GOAL_DEPTH - 30;
      const atGoalLine = Math.abs(ax - aiGoalX) < 40;
      const ballAwayFromGoal = ball.x < CANVAS_W - 250;
      let desiredVx: number;
      if (distToTarget > 25) {
        desiredVx = Math.sign(moveDiff) * moveSpeed;
      } else if (distToTarget > 8) {
        desiredVx = Math.sign(moveDiff) * moveSpeed * 0.7;
      } else if (distToTarget > 2) {
        desiredVx = Math.sign(moveDiff) * moveSpeed * 0.35;
      } else {
        desiredVx = Math.abs(toBall) > 30 ? Math.sign(toBall) * moveSpeed * 0.2 : ai.vx * 0.95;
      }
      // 골대 앞에 붙어있는데 공이 멀리 있으면 공 쪽으로 나가기 (멈춤 방지)
      if (atGoalLine && ballAwayFromGoal && Math.abs(toBall) > 50) {
        desiredVx = Math.sign(toBall) * moveSpeed * 0.4;
      }
      const AI_VX_SMOOTH = 0.22;
      ai.vx += (desiredVx - ai.vx) * AI_VX_SMOOTH;
      ai.x += ai.vx;
      // AI도 플레이어처럼 전 필드 이동 가능 (중앙선 제한 제거)
      ai.x = Math.max(20, Math.min(CANVAS_W - 20 - ai.w, ai.x));

      // AI 점프 (고수 수준 - 완벽한 타이밍)
      if (onGround(ai)) {
        let shouldJump = false;
        let jumpPower = 1.0; // 최대 점프
        
        // 빠른 공 방어 (게임 시작 직후 대응) - 매우 넓은 범위
        if (fastBallToGoal && ball.y < ai.y + 70 && Math.abs(ball.x - ax) < 180) {
          shouldJump = true;
          jumpPower = 1.0;
        }
        // 공이 위에 있고 가까울 때 (매우 넓은 범위)
        if (ball.y < ai.y - 5 && Math.abs(diffX) < 160) {
          shouldJump = true;
          jumpPower = 1.0;
        }
        // 공이 떨어지고 있을 때 (인터셉트) - 매우 빠른 반응, 매우 넓은 범위
        if (ball.vy > 1.0 && Math.abs(diffX) < 140 && ball.y < ai.y + 80) {
          shouldJump = true;
          jumpPower = 0.98;
        }
        // 플레이어가 헤딩하려고 할 때 (방어) - 매우 빠른 반응, 매우 넓은 범위
        if (player.vy < -4 && Math.abs(px - ax) < 180 && ball.y < ai.y + 60) {
          shouldJump = true;
          jumpPower = 1.0;
        }
        // 공이 골대로 올 때 (골대 방어) - 매우 적극적, 매우 넓은 범위
        if ((ballMovingToPlayerGoal || ballNearPlayerGoal || fastBallToGoal) && ball.y < ai.y + 50 && Math.abs(ball.x - (GOAL_DEPTH + 25)) < 140) {
          shouldJump = true;
          jumpPower = 1.0;
        }
        // 공이 골대 위로 올라갈 때 (골대 방어) - 매우 넓은 범위
        if (ball.x < 300 && ball.y < GOAL_TOP + 50 && ball.vy < 0) {
          shouldJump = true;
          jumpPower = 1.0;
        }
        // 플레이어가 슈퍼킥을 사용할 때 (예측 점프) - 매우 넓은 범위
        if (playerSuperCooldownRef.current === SUPER_KICK_COOLDOWN - 1 && Math.abs(px - ax) < 200) {
          shouldJump = true;
          jumpPower = 0.95;
        }
        // 공이 빠르게 중앙에서 올 때 (게임 시작 직후) - 매우 넓은 범위
        if (ballSpeed > 7 && ballInCenter && ball.vx < -2 && Math.abs(diffX) < 190) {
          shouldJump = true;
          jumpPower = 1.0;
        }
        
        if (shouldJump) {
          ai.vy = PLAYER_JUMP * jumpPower;
        }
      }
      ai.vy += 0.6;
      ai.y += ai.vy;
      if (ai.y + ai.h >= GROUND_Y) {
        ai.y = GROUND_Y - ai.h;
        ai.vy = 0;
      }

      // AI 액션 (고수 수준 - 거의 완벽)
      // 상대(AI)가 노려야 할 골 = 왼쪽 골대(플레이어 골)만
      const AI_ATTACK_GOAL_X = GOAL_LEFT + GOAL_DEPTH;
      const AI_ATTACK_GOAL_Y = (GOAL_TOP + GOAL_BOTTOM) / 2;
      if (aiActionCooldownRef.current <= 0) {
        const rand = Math.random();
        
        // 상황별 우선순위 결정
        const ballNearHead = Math.abs(diffX) < HEADING_RANGE && Math.abs(ball.y - (ai.y - ai.headRadius + 4)) < HEADING_RANGE * 1.2;
        const canSuperKick = aiSuperCooldownRef.current <= 0 && ballInRange(ball, ai, SUPER_KICK_RANGE);
        const canKick = ballInRange(ball, ai, TACKLE_RANGE);
        
        // 슈퍼킥 우선 (자책골 방지: AI 골대 쪽에서는 절대 슈퍼킥 안 함)
        if (canSuperKick) {
          if (ballNearAiGoal || ballMovingToAiGoal || ballVeryNearAiGoal) {
            // 수비만 함 (슈퍼킥 금지)
          }
          else {
            let superChance = 0.98 + Math.random() * 0.02;
            if (ballOnAiSide && playerDist > 100 && ball.x < CANVAS_W - 200) superChance = 0.99 + Math.random() * 0.01;
            else if (ball.x < 450 && ball.y > GOAL_TOP - 50 && ball.y < GOAL_BOTTOM + 50 && ball.x < CANVAS_W / 2) superChance = 1.0;
            else if (playerDist > 90 && ball.x < CANVAS_W - 200) superChance = 0.99;
            else if (ballMovingToPlayerGoal && ball.x < 300) superChance = 0.85;
            
            if (rand < superChance) {
              aiSuperCooldownRef.current = SUPER_KICK_COOLDOWN;
              aiActionCooldownRef.current = 3;
              aiLastActionRef.current = 8;
              
              // 항상 왼쪽 골대(플레이어 골)로만 슈팅
              const toGoalX = AI_ATTACK_GOAL_X - ball.x;
              const toGoalY = AI_ATTACK_GOAL_Y - ball.y;
              const toGoalDist = Math.hypot(toGoalX, toGoalY) || 1;
              const toGoalNx = toGoalX / toGoalDist;
              const toGoalNy = toGoalY / toGoalDist;
              ball.vx = SUPER_KICK_FORCE * toGoalNx * (0.95 + Math.random() * 0.05);
              ball.vy = SUPER_KICK_FORCE * toGoalNy * (0.95 + Math.random() * 0.05) - 1.5;
              // 자책골 최종 방지: 오른쪽으로 가면 무조건 왼쪽으로 수정
              if (ball.vx > 0) {
                const sx = AI_ATTACK_GOAL_X - ball.x;
                const sy = AI_ATTACK_GOAL_Y - ball.y;
                const sd = Math.hypot(sx, sy) || 1;
                ball.vx = SUPER_KICK_FORCE * (sx / sd) * 0.95;
                ball.vy = SUPER_KICK_FORCE * (sy / sd) * 0.95 - 1.5;
              }
              superKickActiveRef.current = true;
              spawnSuperKickImpact(ball.x, ball.y, -1);
              screenFlashRef.current = 1;
              screenFlashSecondRef.current = false;
            }
          }
        }
        // 헤딩 (공이 머리 위에 있을 때) - 자책골 방지: AI 골대 쪽이면 수비만
        else if (ballNearHead) {
          if (ballNearAiGoal || ballMovingToAiGoal || ballVeryNearAiGoal) {
            aiActionCooldownRef.current = 3;
            aiLastActionRef.current = 6;
            ball.vy = HEADING_FORCE * 0.9;
            ball.vx += HEADING_H_FORCE * 0.8; // 오른쪽으로 (골대에서 밀어냄 - 수비)
          }
          else {
            let headingChance = 0.98 + Math.random() * 0.02;
            if (ballMovingToPlayerGoal || ballNearPlayerGoal) headingChance = 0.99 + Math.random() * 0.01;
            else if (ballOnAiSide && playerDist > 80 && ball.x < CANVAS_W - 200) headingChance = 0.99;
            
            if (rand < headingChance) {
              aiActionCooldownRef.current = 3;
              aiLastActionRef.current = 6;
              // 자책골 방지: AI 쪽(오른쪽)에 있으면 무조건 왼쪽(플레이어 골대)으로만
              if (ballOnAiHalf) {
                ball.vy = HEADING_FORCE * 1.0;
                ball.vx -= HEADING_H_FORCE * 0.95; // 왼쪽으로만
              } else {
                // 항상 왼쪽 골대(플레이어 골) 방향으로 헤딩
                const toGoalX = AI_ATTACK_GOAL_X - ball.x;
                const toGoalY = AI_ATTACK_GOAL_Y - ball.y;
                const toGoalDist = Math.hypot(toGoalX, toGoalY) || 0.1;
                const toGoalNx = toGoalX / toGoalDist;
                ball.vy = HEADING_FORCE * (1.0 + Math.random() * 0.1);
                ball.vx += HEADING_H_FORCE * toGoalNx * (0.9 + Math.random() * 0.1);
              }
              // 자책골 최종 방지: 오른쪽으로 가면 무조건 왼쪽으로 수정
              if (ball.vx > 0) {
                ball.vx = -HEADING_H_FORCE * 0.95;
                ball.vy = HEADING_FORCE * 1.0;
              }
            }
          }
        }
        // 일반 킥 - 자책골 방지: AI 골대 쪽에서는 공격 킥 금지
        else if (canKick) {
          if (ballNearAiGoal || ballMovingToAiGoal || ballVeryNearAiGoal) {
            // 수비만 함
          }
          else {
            let kickChance = 0.95 + Math.random() * 0.05;
            if (ball.x < 450 && ball.x < CANVAS_W / 2) kickChance = 0.98 + Math.random() * 0.02;
            else if (ballOnAiSide && playerDist > 80 && ball.x < CANVAS_W - 200) kickChance = 0.97 + Math.random() * 0.03;
            else if (ballMovingToPlayerGoal && ball.x < 300) kickChance = 0.85;
            
            if (rand < kickChance) {
              aiActionCooldownRef.current = 3 + Math.random() * 2;
              aiLastActionRef.current = 8;
              // 항상 왼쪽 골대(플레이어 골)로만 슈팅
              const toGoalX = AI_ATTACK_GOAL_X - ball.x;
              const toGoalY = AI_ATTACK_GOAL_Y - ball.y;
              const toGoalDist = Math.hypot(toGoalX, toGoalY) || 1;
              const toGoalNx = toGoalX / toGoalDist;
              const kickPower = 0.85 + Math.random() * 0.1;
              ball.vx = SHOT_FORCE * toGoalNx * kickPower;
              ball.vy = -SHOT_FORCE * 0.4 * kickPower;
              // 자책골 최종 방지: 오른쪽으로 가면 무조건 왼쪽으로 수정
              if (ball.vx > 0) {
                const sx = AI_ATTACK_GOAL_X - ball.x;
                const sy = AI_ATTACK_GOAL_Y - ball.y;
                const sd = Math.hypot(sx, sy) || 1;
                ball.vx = SHOT_FORCE * (sx / sd) * kickPower;
                ball.vy = -SHOT_FORCE * 0.4 * kickPower;
              }
            }
          }
        }
      }
      }

      // 공이 캐릭터에게 붙어있는 시간 추적 및 강제 튕기기
      const STUCK_THRESHOLD = 50; // 공이 붙어있다고 판단하는 거리
      const STUCK_TIME_LIMIT = 42; // 0.7초 (60fps 기준)
      
      // 플레이어와의 거리 체크 (기존 playerDist 변수 재사용)
      if (playerDist < STUCK_THRESHOLD && Math.hypot(ball.vx, ball.vy) < 3) {
        ballStuckToPlayerRef.current++;
        if (ballStuckToPlayerRef.current >= STUCK_TIME_LIMIT) {
          // 3초 동안 붙어있으면 랜덤 방향으로 강제 튕기기
          const angle = Math.random() * Math.PI * 2;
          const force = 15 + Math.random() * 10; // 15~25의 힘
          ball.vx = Math.cos(angle) * force;
          ball.vy = Math.sin(angle) * force - 2; // 약간 위로
          ballStuckToPlayerRef.current = 0;
        }
      } else {
        ballStuckToPlayerRef.current = 0;
      }
      
      // AI와의 거리 체크
      const aiDist = Math.hypot(ball.x - (ai.x + ai.w / 2), ball.y - (ai.y + ai.h / 2));
      if (aiDist < STUCK_THRESHOLD && Math.hypot(ball.vx, ball.vy) < 3) {
        ballStuckToAiRef.current++;
        if (ballStuckToAiRef.current >= STUCK_TIME_LIMIT) {
          // 3초 동안 붙어있으면 랜덤 방향으로 강제 튕기기
          const angle = Math.random() * Math.PI * 2;
          const force = 15 + Math.random() * 10; // 15~25의 힘
          ball.vx = Math.cos(angle) * force;
          ball.vy = Math.sin(angle) * force - 2; // 약간 위로
          ballStuckToAiRef.current = 0;
        }
      } else {
        ballStuckToAiRef.current = 0;
      }

      // 공-캐릭터 충돌 (머리 영역 포함, 관통 완전 방지)
      [player, ai].forEach((e, index) => {
        const cx = e.x + e.w / 2;
        const cy = e.y + e.h / 2;
        const eHalfW = e.w / 2;
        const eHalfH = e.h / 2;
        
        // 머리 중심 위치
        const headCenterX = cx;
        const headCenterY = e.y - e.headRadius + 4;
        const headR = e.headRadius;
        
        // 공의 현재 위치
        const bx = ball.x;
        const by = ball.y;
        const br = ball.radius;
        
        // 공의 이전 위치
        const prevBx = ballPrevPosRef.current.x;
        const prevBy = ballPrevPosRef.current.y;
        
        // 1. 머리 영역 충돌 체크 (원형)
        const headDx = bx - headCenterX;
        const headDy = by - headCenterY;
        const headDist = Math.hypot(headDx, headDy);
        const headMinDist = br + headR + 5; // 머리와 공의 최소 거리
        
        let headCollision = false;
        let headCollisionPoint = { x: bx, y: by };
        
        // 머리 영역 충돌 감지 (이동 경로 포함)
        const ballSpeed = Math.hypot(ball.vx, ball.vy);
        if (ballSpeed > 0.1) {
          const steps = Math.ceil(ballSpeed / 1.5) + 1;
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const checkX = prevBx + (bx - prevBx) * t;
            const checkY = prevBy + (by - prevBy) * t;
            const checkHeadDx = checkX - headCenterX;
            const checkHeadDy = checkY - headCenterY;
            const checkHeadDist = Math.hypot(checkHeadDx, checkHeadDy);
            
            if (checkHeadDist < headMinDist) {
              headCollision = true;
              headCollisionPoint = { x: checkX, y: checkY };
              break;
            }
          }
        }
        
        // 현재 위치에서도 머리 충돌 체크
        if (!headCollision && headDist < headMinDist) {
          headCollision = true;
        }
        
        // 머리 충돌 처리 (항상 튕기기)
        if (headCollision) {
          const headNx = headDist > 0.01 ? headDx / headDist : 0;
          const headNy = headDist > 0.01 ? headDy / headDist : -1;
          
          // 공을 머리 밖으로 강제로 밀어냄
          ball.x = headCenterX + headNx * headMinDist;
          ball.y = headCenterY + headNy * headMinDist;
          
          // 항상 튕기기 (조건 없이)
          const relativeVx = ball.vx - e.vx * 0.15;
          const relativeVy = ball.vy - e.vy * 0.15;
          const relativeVn = relativeVx * headNx + relativeVy * headNy;
          
          // 상대 속도가 음수면 (접근 중) 튕기기, 양수면 (이미 멀어지는 중) 더 강하게 튕기기
          if (relativeVn < 0) {
            // 접근 중: 반사
            ball.vx -= 2.5 * relativeVn * headNx;
            ball.vy -= 2.5 * relativeVn * headNy;
          } else {
            // 이미 멀어지는 중이지만 충돌했으므로 강제로 튕기기
            ball.vx = -headNx * 7;
            ball.vy = -headNy * 7;
          }
          
          // 최소 튕김 속도 보장 (항상 튕기기)
          const bounceSpeed = Math.hypot(ball.vx, ball.vy);
          if (bounceSpeed < 5) {
            const angle = Math.atan2(headNy, headNx) + (Math.random() - 0.5) * 0.4;
            ball.vx = Math.cos(angle) * 7;
            ball.vy = Math.sin(angle) * 7;
          }
        }
        
        // 2. 몸체 영역 충돌 체크 (기존 로직)
        const eLeft = e.x;
        const eRight = e.x + e.w;
        const eTop = e.y;
        const eBottom = e.y + e.h;
        
        const margin = br + 3;
        const inBox = bx + margin > eLeft && bx - margin < eRight &&
                      by + margin > eTop && by - margin < eBottom;
        
        let bodyCollisionDetected = false;
        
        if (ballSpeed > 0.1 && !headCollision) {
          const steps = Math.ceil(ballSpeed / 2) + 1;
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const checkX = prevBx + (bx - prevBx) * t;
            const checkY = prevBy + (by - prevBy) * t;
            
            // 머리 영역은 제외하고 몸체만 체크
            const checkHeadDx = checkX - headCenterX;
            const checkHeadDy = checkY - headCenterY;
            const checkHeadDist = Math.hypot(checkHeadDx, checkHeadDy);
            
            if (checkHeadDist >= headMinDist && // 머리 영역이 아니고
                checkX + br > eLeft && checkX - br < eRight &&
                checkY + br > eTop && checkY - br < eBottom) {
              bodyCollisionDetected = true;
              ball.x = checkX;
              ball.y = checkY;
              break;
            }
          }
        }
        
        // 몸체 충돌 처리 (항상 튕기기)
        const dx = bx - cx;
        const dy = by - cy;
        const dist = Math.hypot(dx, dy);
        const minDist = br + Math.max(eHalfW, eHalfH) + 8;
        
        if ((bodyCollisionDetected || inBox || dist < minDist) && !headCollision) {
          const nx = dist > 0.01 ? dx / dist : 1;
          const ny = dist > 0.01 ? dy / dist : 0;
          
          // 공을 캐릭터 밖으로 강제로 밀어냄
          ball.x = cx + nx * minDist;
          ball.y = cy + ny * minDist;
          
          // 공이 캐릭터 안에 완전히 들어간 경우
          if (dist < br * 0.8 || inBox) {
            // 강제로 밀어내고 튕기기
            ball.x = cx + nx * (minDist + 18);
            ball.y = cy + ny * (minDist + 18);
            const escapeAngle = Math.atan2(ny, nx) + (Math.random() - 0.5) * 0.4;
            const escapeSpeed = 8 + Math.random() * 2;
            ball.vx = Math.cos(escapeAngle) * escapeSpeed;
            ball.vy = Math.sin(escapeAngle) * escapeSpeed;
          } else {
            // 항상 튕기기 (조건 없이)
            const relativeVx = ball.vx - e.vx * 0.25;
            const relativeVy = ball.vy - e.vy * 0.25;
            const relativeVn = relativeVx * nx + relativeVy * ny;
            
            // 상대 속도에 관계없이 항상 튕기기
            if (relativeVn < 0) {
              // 접근 중: 반사
              ball.vx -= 2.3 * relativeVn * nx;
              ball.vy -= 2.3 * relativeVn * ny;
            } else {
              // 이미 멀어지는 중이지만 충돌했으므로 강제로 튕기기
              ball.vx = -nx * 8;
              ball.vy = -ny * 8;
            }
            
            // 공이 캐릭터와 같은 방향으로 움직여도 튕기기
            const sameDir = (ball.vx * nx + ball.vy * ny) > 0;
            if (sameDir || dist < minDist * 0.95) {
              ball.vx = -nx * (7 + Math.random() * 2);
              ball.vy = -ny * (7 + Math.random() * 2);
            }
          }
          
          // 최소 튕김 속도 보장 (항상 튕기기)
          const bounceSpeed = Math.hypot(ball.vx, ball.vy);
          if (bounceSpeed < 4.5) {
            const angle = Math.atan2(ny, nx) + (Math.random() - 0.5) * 0.5;
            const minBounceSpeed = 5 + Math.random() * 2;
            ball.vx = Math.cos(angle) * minBounceSpeed;
            ball.vy = Math.sin(angle) * minBounceSpeed;
          }
        }
        
        // 추가 안전장치: 공이 머리나 몸체 영역 안에 있으면 강제로 밀어내고 튕기기
        if (!headCollision && (headDist < headMinDist || 
            (bx + br > eLeft && bx - br < eRight && by + br > eTop && by - br < eBottom))) {
          const escapeDx = headDist < headMinDist ? headDx : dx;
          const escapeDy = headDist < headMinDist ? headDy : dy;
          const escapeDist = Math.hypot(escapeDx, escapeDy);
          if (escapeDist > 0.01) {
            const escapeNx = escapeDx / escapeDist;
            const escapeNy = escapeDy / escapeDist;
            const escapeMinDist = headDist < headMinDist ? headMinDist : minDist;
            ball.x = (headDist < headMinDist ? headCenterX : cx) + escapeNx * (escapeMinDist + 10);
            ball.y = (headDist < headMinDist ? headCenterY : cy) + escapeNy * (escapeMinDist + 10);
            
            // 항상 튕기기 (속도가 작아도)
            const currentSpeed = Math.hypot(ball.vx, ball.vy);
            if (currentSpeed < 3) {
              const escapeAngle = Math.atan2(escapeNy, escapeNx) + (Math.random() - 0.5) * 0.3;
              ball.vx = Math.cos(escapeAngle) * (6 + Math.random() * 2);
              ball.vy = Math.sin(escapeAngle) * (6 + Math.random() * 2);
            } else {
              // 속도가 있어도 방향 보정
              const dot = ball.vx * escapeNx + ball.vy * escapeNy;
              if (dot > 0) {
                // 캐릭터 쪽으로 가고 있으면 반대로 튕기기
                ball.vx = -escapeNx * (currentSpeed * 0.8 + 3);
                ball.vy = -escapeNy * (currentSpeed * 0.8 + 3);
              }
            }
          }
        }
      });
    }

    function draw() {
      const w = CANVAS_W;
      const h = CANVAS_H;
      ctx.clearRect(0, 0, w, h);

      // 세리머니: 득점자 중심 확대 + 화면 회전
      const cel = celebrationRef.current;
      if (cel.active && ctx) {
        const player = playerRef.current;
        const ai = aiRef.current;
        const scorerX = cel.target === 'player' ? player.x + player.w / 2 : ai.x + ai.w / 2;
        const scorerY = cel.target === 'player' ? player.y + player.h / 2 : ai.y + ai.h / 2;
        const p = Math.min(1, cel.progress);
        const bounce = Math.sin(p * Math.PI) * 0.25;
        const scale = 1 + p * 1.8 + bounce;
        const angle = p * Math.PI * 6 + Math.sin(p * Math.PI * 8) * 0.4;
        const tShake = performance.now() * 0.012;
        const shakeX = Math.sin(tShake) * 6 + Math.sin(tShake * 2.3) * 3;
        const shakeY = Math.cos(tShake * 1.1) * 5 + Math.cos(tShake * 2.7) * 3;
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.translate(shakeX, shakeY);
        ctx.scale(scale, scale);
        ctx.rotate(angle);
        ctx.translate(-scorerX, -scorerY);
      }

      // 스탠드
      const standG = ctx.createLinearGradient(0, 0, 0, STAND_HEIGHT);
      standG.addColorStop(0, '#1e3a5f');
      standG.addColorStop(1, '#2a4365');
      ctx.fillStyle = standG;
      ctx.fillRect(0, 0, w, STAND_HEIGHT);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 24; col++) {
          ctx.fillRect(18 + col * 40 + (row % 2) * 18, 10 + row * 14, 10, 12);
        }
      }
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MAD PUFFINS', w / 2, 50);

      // 필드
      ctx.fillStyle = '#4caf50';
      ctx.fillRect(0, FIELD_TOP, w, h - FIELD_TOP);
      ctx.fillStyle = '#81c784';
      ctx.fillRect(0, GROUND_Y, w, h - GROUND_Y);

      // 라인
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w / 2, FIELD_TOP);
      ctx.lineTo(w / 2, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w / 2, (FIELD_TOP + GROUND_Y) / 2, 70, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeRect(0, GOAL_TOP - 20, 120, GOAL_BOTTOM - GOAL_TOP + 40);
      ctx.strokeRect(w - 120, GOAL_TOP - 20, 120, GOAL_BOTTOM - GOAL_TOP + 40);

      // 골대
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 6;
      ctx.strokeRect(0, GOAL_TOP, GOAL_DEPTH, GOAL_BOTTOM - GOAL_TOP);
      ctx.strokeRect(w - GOAL_DEPTH, GOAL_TOP, GOAL_DEPTH, GOAL_BOTTOM - GOAL_TOP);
      ctx.fillStyle = 'rgba(255,215,0,0.1)';
      ctx.fillRect(0, GOAL_TOP, GOAL_DEPTH, GOAL_BOTTOM - GOAL_TOP);
      ctx.fillRect(w - GOAL_DEPTH, GOAL_TOP, GOAL_DEPTH, GOAL_BOTTOM - GOAL_TOP);

      // 캐릭터
      function drawChar(e: Entity, isPlayer: boolean) {
        const cx = e.x + e.w / 2;
        const hy = e.y - e.headRadius + 6;

        // 머리
        ctx.fillStyle = '#f5d0a9';
        ctx.beginPath();
        ctx.arc(cx, hy, e.headRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#5d4037';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 머리카락
        ctx.fillStyle = isPlayer ? '#4a2c0a' : '#1a1a1a';
        ctx.beginPath();
        ctx.arc(cx, hy - 6, e.headRadius * 0.85, Math.PI, 2 * Math.PI);
        ctx.fill();

        // 눈
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(cx - 7, hy - 2, 3, 0, Math.PI * 2);
        ctx.arc(cx + 7, hy - 2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx - 6, hy - 3, 1, 0, Math.PI * 2);
        ctx.arc(cx + 8, hy - 3, 1, 0, Math.PI * 2);
        ctx.fill();

        // 입
        ctx.strokeStyle = '#8b5a2b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, hy + 8, 5, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.stroke();

        // 몸 (줄무늬)
        const by = e.y + 4;
        const bh = e.h * 0.5;
        const bx = e.x;
        const sw = e.w / 5;
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = i % 2 === 0 ? (isPlayer ? '#d32f2f' : '#212121') : '#fff';
          ctx.fillRect(bx + i * sw, by, sw + 0.5, bh);
        }

        // 바지
        ctx.fillStyle = isPlayer ? '#fff' : '#212121';
        ctx.fillRect(bx, by + bh, e.w, e.h * 0.5 - 4);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, e.w, e.h - 4);

        // "my"
        if (isPlayer) {
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 3;
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.strokeText('my', cx, hy - e.headRadius - 10);
          ctx.fillText('my', cx, hy - e.headRadius - 10);
        }
      }
      drawChar(playerRef.current, true);
      drawChar(aiRef.current, false);

      // 궁극기 (T) — 하늘에서 반짝이며 내려오는 이펙트 (간지 업)
      const uFall = ultimateFallingRef.current;
      if (uFall && ctx) {
        const cx = uFall.targetAx;
        const beamW = 120;
        ctx.save();
        // 외곽 글로우 (넓게)
        const gOuter = ctx.createLinearGradient(cx - beamW, FIELD_TOP, cx + beamW, uFall.y + 100);
        gOuter.addColorStop(0, 'rgba(255,255,255,0)');
        gOuter.addColorStop(0.15, 'rgba(255,235,59,0.12)');
        gOuter.addColorStop(0.35, 'rgba(255,213,0,0.25)');
        gOuter.addColorStop(0.5, 'rgba(255,193,7,0.35)');
        gOuter.addColorStop(0.7, 'rgba(255,171,0,0.3)');
        gOuter.addColorStop(0.85, 'rgba(255,152,0,0.2)');
        gOuter.addColorStop(1, 'rgba(255,255,255,0.08)');
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = gOuter;
        ctx.fillRect(cx - beamW, FIELD_TOP, beamW * 2, uFall.y - FIELD_TOP + 120);
        // 코어 빔 (좁고 밝게)
        const gCore = ctx.createLinearGradient(cx, FIELD_TOP, cx, uFall.y + 80);
        gCore.addColorStop(0, 'rgba(255,255,255,0)');
        gCore.addColorStop(0.2, 'rgba(255,255,255,0.4)');
        gCore.addColorStop(0.45, 'rgba(255,245,157,0.7)');
        gCore.addColorStop(0.65, 'rgba(255,235,59,0.85)');
        gCore.addColorStop(0.85, 'rgba(255,213,0,0.6)');
        gCore.addColorStop(1, 'rgba(255,193,7,0.35)');
        ctx.fillStyle = gCore;
        ctx.fillRect(cx - 28, FIELD_TOP, 56, uFall.y - FIELD_TOP + 100);
        ctx.restore();
        uFall.sparks.forEach((s) => {
          const a = s.life / s.maxLife;
          ctx.globalAlpha = a;
          ctx.fillStyle = s.color;
          ctx.shadowColor = s.color;
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.size * 1.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        });
        ctx.globalAlpha = 1;
      }
      // 궁극기 — 속박 적중 시 짧은 플래시 (간지)
      if (ultimateImpactRef.current > 0 && ctx) {
        const ai = aiRef.current;
        const ix = ai.x + ai.w / 2;
        const iy = ai.y + ai.h / 2;
        const life = ultimateImpactRef.current;
        const alpha = life / 25;
        const r = 40 + (25 - life) * 12;
        const grad = ctx.createRadialGradient(ix, iy, 0, ix, iy, r);
        grad.addColorStop(0, `rgba(255,255,255,${alpha * 0.9})`);
        grad.addColorStop(0.2, `rgba(255,235,59,${alpha * 0.7})`);
        grad.addColorStop(0.5, `rgba(255,193,7,${alpha * 0.4})`);
        grad.addColorStop(0.8, `rgba(255,152,0,${alpha * 0.15})`);
        grad.addColorStop(1, 'rgba(255,100,0,0)');
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ix, iy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // 궁극기 — 상대 속박 이펙트 (간지: 고리 + 룬풍 스파클 + 글로우)
      if (aiBoundRef.current > 0 && ctx) {
        const ai = aiRef.current;
        const cx = ai.x + ai.w / 2;
        const cy = ai.y + ai.h / 2;
        const t = performance.now() * 0.01;
        ctx.save();
        // 바깥 글로우
        const glowR = 80 + Math.sin(t) * 8;
        const gGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
        gGlow.addColorStop(0, 'rgba(255,235,59,0.25)');
        gGlow.addColorStop(0.4, 'rgba(255,193,7,0.12)');
        gGlow.addColorStop(0.7, 'rgba(255,152,0,0.05)');
        gGlow.addColorStop(1, 'rgba(255,100,0,0)');
        ctx.fillStyle = gGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
        ctx.fill();
        // 금색 + 보라 톤 고리 (두꺼움)
        for (let ring = 0; ring < 4; ring++) {
          const r = 22 + ring * 16 + Math.sin(t + ring * 0.7) * 4;
          ctx.strokeStyle = ring % 2 === 0 ? 'rgba(255,235,59,0.95)' : 'rgba(186,85,211,0.6)';
          ctx.lineWidth = 4;
          ctx.shadowColor = ring % 2 === 0 ? '#ffeb3b' : '#ba55d3';
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.ellipse(cx, cy - 8, r, r * 0.75, t * 0.6 + ring * 0.3, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.restore();
        const sparkCount = 20;
        for (let i = 0; i < sparkCount; i++) {
          const a = (i / sparkCount) * Math.PI * 2 + t * 2;
          const r = 20 + Math.sin(t + i * 0.5) * 14;
          const sx = cx + Math.cos(a) * r;
          const sy = cy - 14 + Math.sin(a) * r * 0.6;
          const size = 6 + Math.sin(t * 3 + i) * 3;
          const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 2);
          grad.addColorStop(0, 'rgba(255,255,255,0.98)');
          grad.addColorStop(0.3, 'rgba(255,235,59,0.9)');
          grad.addColorStop(0.6, 'rgba(255,193,7,0.5)');
          grad.addColorStop(1, 'rgba(255,152,0,0)');
          ctx.globalAlpha = 0.85 + Math.sin(t * 2 + i) * 0.15;
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(sx, sy, size * 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // 슈퍼킥 임팩트 — 플래시 (반짝임)
      const flash = superKickFlashRef.current;
      if (flash && ctx) {
        const r = 35 + (8 - flash.life) * 10;
        const g = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.2, 'rgba(255,240,180,0.85)');
        g.addColorStop(0.45, 'rgba(255,200,80,0.5)');
        g.addColorStop(0.7, 'rgba(255,120,40,0.2)');
        g.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.globalAlpha = flash.life / 8;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(flash.x, flash.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // 슈퍼킥 임팩트 — 확장 링
      superKickRingsRef.current.forEach((ring) => {
        if (!ctx) return;
        const a = ring.life / ring.maxLife;
        ctx.strokeStyle = `rgba(255,200,80,${a})`;
        ctx.lineWidth = 4;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
        ctx.stroke();
      });
      if (ctx) {
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1;
      }

      // 파티클 (불꽃 + 스파클)
      particlesRef.current.forEach((p) => {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        if (p.type === 'spark') {
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        if (p.type === 'spark') {
          ctx.shadowBlur = 0;
        }
      });
      ctx.globalAlpha = 1;

      // 공 — R 슈퍼킥 시 반짝임 강화
      const b = ballRef.current;
      if (superKickActiveRef.current && ctx) {
        ctx.shadowColor = '#fff9c4';
        ctx.shadowBlur = 42;
        const glow = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius + 22);
        glow.addColorStop(0, 'rgba(255,255,220,0.75)');
        glow.addColorStop(0.25, 'rgba(255,240,150,0.5)');
        glow.addColorStop(0.5, 'rgba(255,200,80,0.25)');
        glow.addColorStop(1, 'rgba(255,150,40,0)');
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius + 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + (performance.now() * 0.012) % (Math.PI * 2);
          const sx = b.x + Math.cos(a) * (b.radius + 6);
          const sy = b.y + Math.sin(a) * (b.radius + 6);
          const star = ctx.createRadialGradient(sx, sy, 0, sx, sy, 6);
          star.addColorStop(0, 'rgba(255,255,255,0.95)');
          star.addColorStop(0.5, 'rgba(255,240,180,0.5)');
          star.addColorStop(1, 'rgba(255,200,100,0)');
          ctx.fillStyle = star;
          ctx.beginPath();
          ctx.arc(sx, sy, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }
      const gr = ctx.createRadialGradient(b.x - 4, b.y - 4, 0, b.x, b.y, b.radius);
      gr.addColorStop(0, superKickActiveRef.current ? '#fffef5' : '#fff');
      gr.addColorStop(0.5, superKickActiveRef.current ? '#fff0b0' : '#ddd');
      gr.addColorStop(1, superKickActiveRef.current ? '#ffc107' : '#888');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = superKickActiveRef.current ? '#ffd54f' : '#333';
      ctx.lineWidth = superKickActiveRef.current ? 2 : 1;
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#333';
      // 오각형 무늬
      ctx.fillStyle = superKickActiveRef.current ? '#333' : '#222';
      for (let i = 0; i < 5; i++) {
        const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        const px = b.x + Math.cos(angle) * b.radius * 0.5;
        const py = b.y + Math.sin(angle) * b.radius * 0.5;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // 스코어보드
      const sbX = w / 2 - SCOREBOARD_W / 2;
      ctx.fillStyle = '#1565c0';
      ctx.fillRect(sbX, SCOREBOARD_Y, SCOREBOARD_W, SCOREBOARD_H);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(sbX, SCOREBOARD_Y, SCOREBOARD_W, SCOREBOARD_H);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${playerScoreRef.current} : ${aiScoreRef.current}`, w / 2, SCOREBOARD_Y + 32);

      // 쿨다운 게이지 UI
      const cdW = 60;
      const cdH = 8;
      // 플레이어 쿨다운 (왼쪽 하단)
      const pCdRatio = 1 - playerSuperCooldownRef.current / SUPER_KICK_COOLDOWN;
      ctx.fillStyle = '#333';
      ctx.fillRect(20, h - 30, cdW, cdH);
      ctx.fillStyle = pCdRatio >= 1 ? '#ff6b35' : '#888';
      ctx.fillRect(20, h - 30, cdW * pCdRatio, cdH);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(20, h - 30, cdW, cdH);
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('SUPER', 20, h - 34);

      // 궁극기 (T) 쿨다운 (왼쪽 하단, SUPER 아래)
      const ultRatio = 1 - ultimateCooldownRef.current / ULTIMATE_COOLDOWN;
      ctx.fillStyle = '#333';
      ctx.fillRect(20, h - 52, cdW, cdH);
      ctx.fillStyle = ultRatio >= 1 ? '#9c27b0' : '#555';
      ctx.fillRect(20, h - 52, cdW * ultRatio, cdH);
      ctx.strokeStyle = '#e1bee7';
      ctx.strokeRect(20, h - 52, cdW, cdH);
      ctx.fillStyle = '#fff';
      ctx.fillText('T 궁극기', 20, h - 56);

      // AI 쿨다운 (오른쪽 하단)
      const aCdRatio = 1 - aiSuperCooldownRef.current / SUPER_KICK_COOLDOWN;
      ctx.fillStyle = '#333';
      ctx.fillRect(w - 20 - cdW, h - 30, cdW, cdH);
      ctx.fillStyle = aCdRatio >= 1 ? '#ff6b35' : '#888';
      ctx.fillRect(w - 20 - cdW, h - 30, cdW * aCdRatio, cdH);
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(w - 20 - cdW, h - 30, cdW, cdH);
      ctx.textAlign = 'right';
      ctx.fillText('SUPER', w - 20, h - 34);

      // R 슈퍼킥 화면 번쩍번쩍 (이중 플래시)
      if (screenFlashRef.current > 0 && ctx) {
        ctx.save();
        ctx.globalAlpha = screenFlashRef.current;
        ctx.fillStyle = '#fffef5';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
        screenFlashRef.current = Math.max(0, screenFlashRef.current - 0.1);
        if (screenFlashRef.current > 0 && screenFlashRef.current < 0.4 && !screenFlashSecondRef.current) {
          screenFlashSecondRef.current = true;
          screenFlashRef.current = 0.5;
        }
      }

      // 세리머니: 무지개 + 반짝이는 이펙트 (득점자 위에 간지나게)
      const celEnd = celebrationRef.current;
      if (celEnd.active && ctx) {
        const player = playerRef.current;
        const ai = aiRef.current;
        const sx = celEnd.target === 'player' ? player.x + player.w / 2 : ai.x + ai.w / 2;
        const sy = celEnd.target === 'player' ? player.y + player.h / 2 : ai.y + ai.h / 2;
        const p = Math.min(1, celEnd.progress);
        const t = performance.now() * 0.004;

        // 무지개 그라데이션 링 (회전하며 반짝 — 더 빡치게 강렬)
        for (let ring = 0; ring < 5; ring++) {
          const r = 45 + ring * 28 + Math.sin(t * 2 + ring * 2) * 12;
          const grad = ctx.createConicGradient(t * 1.5 + ring * 0.7, sx, sy);
          grad.addColorStop(0, 'rgba(255,0,0,0.95)');
          grad.addColorStop(0.17, 'rgba(255,127,0,0.95)');
          grad.addColorStop(0.33, 'rgba(255,255,0,0.95)');
          grad.addColorStop(0.5, 'rgba(0,255,0,0.95)');
          grad.addColorStop(0.67, 'rgba(0,127,255,0.95)');
          grad.addColorStop(0.83, 'rgba(139,0,255,0.95)');
          grad.addColorStop(1, 'rgba(255,0,0,0.95)');
          ctx.strokeStyle = grad;
          ctx.lineWidth = 8 + Math.sin(t * 5 + ring) * 3;
          ctx.shadowBlur = 28;
          ctx.shadowColor = 'rgba(255,255,255,1)';
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;

        // 무지개 스파클 (득점자 주변 반짝반짝 — 더 많이)
        const rainbow = ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0080ff', '#4b0082', '#ee82ee', '#fff', '#ff0'];
        for (let i = 0; i < 72; i++) {
          const angle = (i / 48) * Math.PI * 2 + t * 2 + p * Math.PI;
          const dist = 40 + Math.sin(t + i * 0.3) * 25 + (i % 3) * 28;
          const x = sx + Math.cos(angle) * dist;
          const y = sy - 15 + Math.sin(angle) * dist * 0.7;
          const size = 4 + Math.sin(t * 4 + i) * 3;
          const color = rainbow[i % rainbow.length];
          ctx.globalAlpha = 0.85 + Math.sin(t * 5 + i * 0.5) * 0.15;
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        // 별 모양 반짝이 (간지 — 더 빡치게)
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2 + t * 2;
          const r = 75 + Math.sin(t * 2 + i) * 20;
          const starX = sx + Math.cos(a) * r;
          const starY = sy - 20 + Math.sin(a) * r * 0.6;
          const pulse = 0.5 + 0.5 * Math.sin(t * 8 + i);
          ctx.save();
          ctx.translate(starX, starY);
          ctx.rotate(t * 1.5 + i * 0.4);
          ctx.scale(pulse, pulse);
          ctx.fillStyle = rainbow[i % rainbow.length];
          ctx.shadowColor = '#fff';
          ctx.shadowBlur = 20;
          ctx.beginPath();
          for (let k = 0; k < 5; k++) {
            const th = (k / 5) * Math.PI * 2 - Math.PI / 2;
            const x = Math.cos(th) * 10;
            const y = Math.sin(th) * 10;
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        ctx.shadowBlur = 0;

        ctx.restore();

        // 화면 전체 반짝반짝 (얄미운 전역 스파클)
        const twinkle = performance.now() * 0.003;
        for (let i = 0; i < 120; i++) {
          const px = ((i * 137.5 + twinkle * 200) % (w + 80)) - 40;
          const py = ((i * 97.3 + twinkle * 150 + i * 11) % (h + 80)) - 40;
          const alpha = 0.25 + 0.5 * Math.sin(twinkle * 12 + i * 0.7);
          const size = Math.max(0.5, 2 + Math.sin(twinkle * 8 + i * 0.5) * 2.5);
          ctx.globalAlpha = Math.max(0, alpha);
          ctx.fillStyle = rainbow[i % rainbow.length];
          ctx.shadowColor = rainbow[i % rainbow.length];
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(px, py, size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        // 세리머니 텍스트 (화면 중앙) — 커졌다 작아졌다 + 반짝반짝
        if (celEnd.message && ctx) {
          const txtTime = performance.now() * 0.004;
          const scale = 0.88 + 0.2 * Math.sin(txtTime * 2.5);
          const sparkle = 0.82 + 0.18 * Math.sin(txtTime * 7);
          const blur = 8 + 14 * Math.sin(txtTime * 5) * Math.sin(txtTime * 5);
          const cx = w / 2;
          const cy = h / 2 - 20;
          const fontSize = Math.max(56, Math.min(140, Math.round(Math.min(w, h) * 0.14)));
          ctx.save();
          ctx.translate(cx, cy);
          ctx.scale(scale, scale);
          ctx.translate(-cx, -cy);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `bold ${fontSize}px sans-serif`;
          ctx.globalAlpha = sparkle;
          ctx.shadowBlur = Math.max(4, blur);
          ctx.shadowColor = `rgba(255,255,255,${0.7 + 0.3 * Math.sin(txtTime * 6)})`;
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#333';
          ctx.lineWidth = Math.max(3, Math.round(fontSize / 10));
          ctx.strokeText(celEnd.message, cx, cy);
          ctx.fillText(celEnd.message, cx, cy);
          ctx.restore();
        }
      }
    }

    function loop(now: number) {
      const delta = (now - last) / 1000;
      last = now;
      if (!paused) {
        acc += Math.min(delta, 0.1);
        while (acc >= DT && running) {
          tick();
          acc -= DT;
        }
      }
      draw();
      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [running, paused, onVictory]);

  const handleResume = useCallback(() => {
    setPaused(false);
  }, []);

  const handleQuit = useCallback(() => {
    if (onQuit) {
      onQuit();
    }
  }, [onQuit]);

  return (
    <div className="game-wrap">
      <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="game-canvas" />
      {paused && (
        <div className="pause-overlay">
          <div className="pause-menu">
            <h2 className="pause-title">일시정지</h2>
            <div className="pause-bgm">
              <label className="pause-bgm-label">BGM 볼륨</label>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round((bgmVolume ?? 0.7) * 100)}
                onChange={(e) => onBgmVolumeChange?.(Number(e.target.value) / 100)}
                className="pause-bgm-slider"
              />
              <span className="pause-bgm-value">{Math.round((bgmVolume ?? 0.7) * 100)}%</span>
            </div>
            <div className="pause-buttons">
              <button type="button" className="pause-btn pause-btn--resume" onClick={handleResume}>
                게임 계속
              </button>
              <button type="button" className="pause-btn pause-btn--quit" onClick={handleQuit}>
                게임 중단
              </button>
            </div>
            <p className="pause-hint">ESC를 눌러도 계속할 수 있습니다</p>
          </div>
        </div>
      )}
    </div>
  );
}
