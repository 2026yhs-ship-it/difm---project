import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// 정적 파일 서빙 (빌드된 클라이언트)
app.use(express.static(join(__dirname, '../dist')));

// 게임 방 관리
const rooms = new Map(); // roomId -> { players: [], gameState: {...} }

// 게임 상태
function createGameState() {
  return {
    ball: { x: 480, y: 180, vx: 0, vy: 0 },
    players: [
      { id: null, x: 150, y: 368, vx: 0, vy: 0, score: 0 },
      { id: null, x: 810, y: 368, vx: 0, vy: 0, score: 0 },
    ],
    resetTimer: 0,
    running: true,
  };
}

io.on('connection', (socket) => {
  console.log('플레이어 연결:', socket.id);

  // 방 생성
  socket.on('create-room', () => {
    const roomId = `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    rooms.set(roomId, {
      players: [socket.id],
      gameState: createGameState(),
      lastUpdate: Date.now(),
    });
    socket.join(roomId);
    socket.emit('room-created', { roomId });
    console.log(`방 생성: ${roomId} by ${socket.id}`);
  });

  // 방 참가
  socket.on('join-room', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('room-error', { message: '방을 찾을 수 없습니다' });
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('room-error', { message: '방이 가득 찼습니다' });
      return;
    }

    room.players.push(socket.id);
    socket.join(roomId);
    
    // 게임 상태 초기화
    room.gameState = createGameState();
    room.gameState.players[0].id = room.players[0];
    room.gameState.players[1].id = room.players[1];

    // 두 플레이어에게 게임 시작 알림
    io.to(roomId).emit('game-start', {
      roomId,
      playerIndex: room.players.indexOf(socket.id),
      gameState: room.gameState,
    });
    console.log(`방 참가: ${roomId} by ${socket.id}`);
  });

  // 플레이어 입력 전송
  socket.on('player-input', ({ roomId, keys, playerIndex }) => {
    const room = rooms.get(roomId);
    if (!room || !room.gameState.running) return;

    // 입력을 다른 플레이어에게 전달
    socket.to(roomId).emit('opponent-input', { keys, playerIndex });
  });

  // 게임 상태 동기화 (호스트가 전송)
  socket.on('game-state', ({ roomId, gameState }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    room.gameState = gameState;
    room.lastUpdate = Date.now();

    // 다른 플레이어에게 상태 전송
    socket.to(roomId).emit('game-state-update', { gameState });
  });

  // 골 이벤트
  socket.on('goal-scored', ({ roomId, scorerIndex, scores }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    room.gameState.players[0].score = scores[0];
    room.gameState.players[1].score = scores[1];
    room.gameState.resetTimer = 50;

    io.to(roomId).emit('goal-update', { scorerIndex, scores });
  });

  // 승리 이벤트
  socket.on('game-victory', ({ roomId, winnerIndex, scores }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    room.gameState.running = false;
    io.to(roomId).emit('victory', { winnerIndex, scores });
  });

  // 연결 해제
  socket.on('disconnect', () => {
    console.log('플레이어 연결 해제:', socket.id);
    
    // 방에서 제거
    for (const [roomId, room] of rooms.entries()) {
      const index = room.players.indexOf(socket.id);
      if (index !== -1) {
        room.players.splice(index, 1);
        if (room.players.length === 0) {
          rooms.delete(roomId);
          console.log(`방 삭제: ${roomId}`);
        } else {
          // 남은 플레이어에게 상대방 나감 알림
          io.to(roomId).emit('opponent-disconnected');
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
