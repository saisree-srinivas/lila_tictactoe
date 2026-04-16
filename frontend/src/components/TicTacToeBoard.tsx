import React, { useEffect, useState } from 'react';
import type { MatchData, MatchmakerMatched } from '@heroiclabs/nakama-js';
import { socket, session } from '../lib/nakama';

const OpCodeMove = 1;
const OpCodeUpdate = 2;
const OpCodeStart = 3;
const OpCodeRematch = 4;

const MarkEmpty = 0;
const MarkX = 1;
const MarkO = 2;

export const TicTacToeBoard: React.FC = () => {
  const [inMatchmaker, setInMatchmaker] = useState(false);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [board, setBoard] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [turnId, setTurnId] = useState<string | null>(null);
  const [winner, setWinner] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Ready to play.");
  const [rematchRequested, setRematchRequested] = useState<boolean>(false);

  useEffect(() => {
    if (!socket) return;

    socket.onmatchmakermatched = async (matched: MatchmakerMatched) => {
      setInMatchmaker(false);
      setStatus("Match found! Joining...");
      try {
        const match = await socket.joinMatch(matched.match_id!);
        setMatchId(match.match_id);
        setStatus("Joined match. Waiting for game to start...");
      } catch (err) {
        console.error("Failed to join match:", err);
        setStatus("Failed to join match.");
      }
    };

    socket.onmatchdata = (matchData: MatchData) => {
      try {
        const payload = JSON.parse(new TextDecoder().decode(matchData.data));

        if (matchData.op_code === OpCodeStart) {
          setBoard(payload.board);
          setTurnId(payload.turn);
          setWinner(null);
          setRematchRequested(false);
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
              if (payload.winner === session?.user_id) {
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
    if (!socket) return;
    setStatus("Looking for opponent...");
    setInMatchmaker(true);
    try {
      await socket.addMatchmaker("*", 2, 2, {}, { "tictactoe": 1 });
    } catch (e) {
      console.error(e);
      setStatus("Error joining matchmaker.");
      setInMatchmaker(false);
    }
  };

  const leaveMatch = async () => {
    if (!socket || !matchId) return;
    await socket.leaveMatch(matchId);
    setMatchId(null);
    setBoard([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    setStatus("Left match.");
    setWinner(null);
    setRematchRequested(false);
  };

  const requestRematch = async () => {
    if (!socket || !matchId) return;
    const encodedData = new TextEncoder().encode("{}");
    await socket.sendMatchState(matchId, OpCodeRematch, encodedData);
    setRematchRequested(true);
    setStatus("Waiting for opponent to rematch...");
  };

  const makeMove = async (index: number) => {
    if (!socket || !matchId || board[index] !== MarkEmpty || winner !== null) return;

    if (turnId !== session?.user_id) {
      return; // Not our turn
    }

    const data = JSON.stringify({ position: index });
    const encodedData = new TextEncoder().encode(data);
    await socket.sendMatchState(matchId, OpCodeMove, encodedData);
  };

  const isMyTurn = turnId === session?.user_id;
  const gameActive = matchId !== null && winner === null;

  return (
    <div className="tictactoe-container">
      <div className="status-panel">
        <p className="status-text">{status}</p>

        {gameActive && (
          <p className={"turn-indicator " + (isMyTurn ? "my-turn" : "opponent-turn")}>
            {isMyTurn ? "Your Turn!" : "Opponent's Turn"}
          </p>
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
          <button className="primary-btn" onClick={joinMatchmaker}>Find Match</button>
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
