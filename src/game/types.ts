export type GamePhase = 'main' | 'playing' | 'victory';

export type Winner = 'player' | 'ai' | null;

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export interface Entity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  headRadius: number;
}

export interface Keys {
  w: boolean;
  a: boolean;
  d: boolean;
  space: boolean;
  r: boolean;
  f: boolean;
  t: boolean;
}
