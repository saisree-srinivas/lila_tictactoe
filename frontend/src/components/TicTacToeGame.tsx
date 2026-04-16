import React, { useEffect, useState } from 'react';
import type { MatchData, MatchmakerMatched } from '@heroiclabs/nakama-js';
import { nakamaService } from '../NakamaService';

const OpCodeMove = 1;
const OpCodeUpdate = 2;
const OpCodeStart = 3;
const OpCodeRematch = 4;

const MarkEmpty = 0;
const MarkX = 1;
const MarkO = 2;

export const TicTacToeGame: React.FC = () => {
  const [inMatchmaker, setInMatchmaker] = useState(false);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [board, setBoard] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [turnId, setTurnId] = useState<string | null>(null);
  const [winner, setWinner] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Ready to play.");
  const [rematchRequested, setRematchRequested] = useState<boolean>(false);
  const [playMode, setPlayMode] = useState<'classic' | 'timed'>('classic');
  const [deadline, setDeadline] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    let timer: number | undefined;
    if (deadline !== null && winner === null && matchId) {
      setTimeLeft(deadline);
      timer = window.setInterval(() => {
        setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => window.clearInterval(timer);
  }, [deadline, turnId, winner, matchId]);

  useEffect(() => {
    const socket = nakamaService.socket;
    if (!socket) return;

    // 1. Listen for matchmaker to successfully pair and join the match correctly
    socket.onmatchmakermatched = async (matched: MatchmakerMatched) => {
      setInMatchmaker(false);
      setStatus("Match found! Joining...");
      try {
        const match = await socket.joinMatch(matched.match_id!);
        // Store the matchId
        setMatchId(match.match_id);
        setStatus("Joined match. Waiting for game to start...");
      } catch (err) {
        console.error("Failed to join match:", err);
        setStatus("Failed to join match.");
      }
    };

    // 2. Listen for incoming match data and update 3x3 grid state
    socket.onmatchdata = (matchData: MatchData) => {
      try {
        const payload = JSON.parse(new TextDecoder().decode(matchData.data));

        if (matchData.op_code === OpCodeStart) {
          setBoard(payload.board);
          setTurnId(payload.turn);
          setWinner(null);
          setRematchRequested(false);
          setDeadline(payload.deadline !== undefined ? payload.deadline : null);
          setStatus("Game Started!");
        }
        else if (matchData.op_code === OpCodeUpdate) {
          if (payload.board) setBoard(payload.board);
          if (payload.turn) setTurnId(payload.turn);

          if (payload.winner) {
            if (payload.winner === "forfeit") {
              setWinner("Opponent forfeited");
              setStatus("Opponent left. You win!");
            } else if (payload.winner === "tie") {
              setWinner("tie");
              setStatus("Game over! It's a tie.");
            } else {
              setWinner(payload.winner);
              if (payload.winner === nakamaService.session?.user_id) {
                setStatus("Game over! You win!");
              } else {
                setStatus("Game over! You lose.");
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed parsing match data", err);
      }
    };

    return () => {
      socket.onmatchmakermatched = undefined as any;
      socket.onmatchdata = undefined as any;
    };
  }, []);

  const joinMatchmaker = async () => {
    setStatus("Looking for opponent...");
    setInMatchmaker(true);
    try {
      await nakamaService.joinMatchmakerPool(playMode);
    } catch (e) {
      console.error(e);
      setStatus("Error joining matchmaker.");
      setInMatchmaker(false);
    }
  };

  const leaveMatch = async () => {
    const socket = nakamaService.socket;
    if (!socket || !matchId) return;
    await socket.leaveMatch(matchId);
    setMatchId(null);
    setBoard([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    setStatus("Ready to play.");
    setWinner(null);
    setRematchRequested(false);
    setDeadline(null);
  };

  const requestRematch = async () => {
    const socket = nakamaService.socket;
    if (!socket || !matchId) return;
    const encodedData = new TextEncoder().encode("{}");
    await socket.sendMatchState(matchId, OpCodeRematch, encodedData);
    setRematchRequested(true);
    setStatus("Waiting for opponent to rematch...");
  };

  // 3. Send a message to the server when a square is clicked
  const makeMove = async (index: number) => {
    const socket = nakamaService.socket;
    if (!socket || !matchId || board[index] !== MarkEmpty || winner !== null) return;

    if (turnId !== nakamaService.session?.user_id) {
      return; // Not our turn
    }

    const data = JSON.stringify({ position: index });
    const encodedData = new TextEncoder().encode(data);
    await socket.sendMatchState(matchId, OpCodeMove, encodedData);
  };

  const isMyTurn = turnId === nakamaService.session?.user_id;
  const gameActive = matchId !== null && winner === null;

  return (
    <div className="tictactoe-container">
      <div className="status-panel">
        <p className="status-text">{status}</p>

        {gameActive && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <p className={"turn-indicator " + (isMyTurn ? "my-turn" : "opponent-turn")}>
              {isMyTurn ? "Your Turn" : "Opponent's Turn"}
            </p>
            {deadline !== null && (
              <p style={{ marginTop: '0.5rem', fontWeight: 600, color: timeLeft <= 5 ? '#ef4444' : '#14b8a6' }}>
                {timeLeft}s
              </p>
            )}
          </div>
        )}
      </div>

      <div className="board">
        {board.map((cell, idx) => {
          const markParams = cell === MarkX ? 'cell-x' : cell === MarkO ? 'cell-o' : '';
          const displayMark = cell === MarkX ? 'X' : cell === MarkO ? 'O' : '';
          const canClick = gameActive && isMyTurn && cell === MarkEmpty && winner === null;

          return (
            <div
              key={idx}
              className={`cell ${markParams} ${canClick ? 'clickable' : ''}`}
              onClick={() => makeMove(idx)}
            >
              {displayMark}
            </div>
          );
        })}
      </div>

      <div className="controls" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {!matchId && !inMatchmaker && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                onClick={() => setPlayMode('classic')}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  border: 'none',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  transition: 'all 0.3s ease',
                  // Dynamic styling based on playMode
                  backgroundColor: playMode === 'classic' ? '#6366f1' : '#1f2937',
                  color: playMode === 'classic' ? '#ffffff' : '#9ca3af',
                  boxShadow: playMode === 'classic' ? '0 0 15px rgba(99, 102, 241, 0.4)' : 'none',
                  transform: playMode === 'classic' ? 'scale(1.02)' : 'scale(1)'
                }}
              >
                Classic
              </button>

              <button
                onClick={() => setPlayMode('timed')}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  border: 'none',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  transition: 'all 0.3s ease',
                  // Dynamic styling based on playMode
                  backgroundColor: playMode === 'timed' ? '#6366f1' : '#1f2937',
                  color: playMode === 'timed' ? '#ffffff' : '#9ca3af',
                  boxShadow: playMode === 'timed' ? '0 0 15px rgba(99, 102, 241, 0.4)' : 'none',
                  transform: playMode === 'timed' ? 'scale(1.02)' : 'scale(1)'
                }}
              >
                Timed
              </button>
            </div>

            <button className="primary-btn" onClick={joinMatchmaker}>
              Find Match
            </button>
          </div>
        )}
        {inMatchmaker && (
          <button className="secondary-btn" disabled>Searching...</button>
        )}
        {matchId && winner !== null && (
          <button className="primary-btn" onClick={requestRematch} disabled={rematchRequested}>
            {rematchRequested ? 'Waiting...' : 'Rematch'}
          </button>
        )}
        {matchId && (
          <button className="danger-btn" onClick={leaveMatch}>Leave Match</button>
        )}
      </div>
    </div>
  );
};
