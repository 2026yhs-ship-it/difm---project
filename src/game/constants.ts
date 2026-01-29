export const CANVAS_W = 960;
export const CANVAS_H = 540;
export const FPS = 60;
export const DT = 1 / FPS;

export const GROUND_Y = 420;
export const FIELD_TOP = 70;
export const STAND_HEIGHT = 70;
export const GOAL_LEFT = 0;
export const GOAL_RIGHT = CANVAS_W;
export const GOAL_TOP = 220;
export const GOAL_BOTTOM = GROUND_Y;
export const GOAL_DEPTH = 50;
export const SCOREBOARD_W = 200;
export const SCOREBOARD_H = 48;
export const SCOREBOARD_Y = CANVAS_H - SCOREBOARD_H - 12;

// 공 물리 (더 빠른 템포)
export const BALL_R = 16;
export const BALL_GRAVITY = 0.55;
export const BALL_BOUNCE = 0.72;
export const BALL_FRICTION = 0.992;
export const HEADING_FORCE = -15;
export const HEADING_H_FORCE = 11;
export const SHOT_FORCE = 18;
export const TACKLE_RANGE = 60;
export const HEADING_RANGE = 55;

// 슈퍼킥 (Soccer Legends 스타일)
export const SUPER_KICK_FORCE = 45;
export const SUPER_KICK_COOLDOWN = 180; // 3초 (60fps)
export const SUPER_KICK_RANGE = 65;

// 플레이어 (더 빠르고 반응적)
export const PLAYER_W = 36;
export const PLAYER_H = 52;
export const PLAYER_HEAD_R = 24;
export const PLAYER_SPEED = 6.5;
export const PLAYER_JUMP = -13;

// AI (개고수 수준 - 거의 불가능)
export const AI_SPEED = 11.5; // 플레이어보다 압도적으로 빠르게
export const AI_REACTION = 0.02; // 거의 즉각 반응
export const AI_JUMP_CHANCE = 0.5; // 매우 적극적인 점프
export const WIN_SCORE = 5;

export const BALL_RESET_X = CANVAS_W / 2;
export const BALL_RESET_Y = 180;
export const PLAYER_START_X = 150;
export const AI_START_X = CANVAS_W - 200; // AI를 더 중앙으로 (방어 강화)

// 궁극기 (T) — 하늘에서 반짝이며 내려와 상대 속박
export const ULTIMATE_COOLDOWN = 600; // 10초 (60fps)
export const AI_BOUND_DURATION = 180; // 3초 속박
