import { Client } from '@heroiclabs/nakama-js';
import type { Session, Socket } from '@heroiclabs/nakama-js';

class NakamaService {
  client: Client;
  session: Session | null = null;
  socket: Socket | null = null;

  constructor() {
    // 1. Initializes the nakamajs.Client
    this.client = new Client("defaultkey", "127.0.0.1", "7350");
  }

  // 2. Authenticates the user via authenticateDevice
  async authenticateDevice(nickname?: string): Promise<Session> {
    let deviceId = localStorage.getItem('nakama_device_id');
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('nakama_device_id', deviceId);
    }
    this.session = await this.client.authenticateDevice(deviceId, true, nickname);
    return this.session;
  }

  // 3. Connects a real-time Socket
  async connectSocket(): Promise<Socket> {
    if (!this.session) {
      throw new Error("You must authenticate before connecting the socket.");
    }

    // Create the socket and cast it to the Socket type
    this.socket = this.client.createSocket(false, false) as Socket;
    await this.socket.connect(this.session, true);
    return this.socket;
  }

  // 4. Adds a function to addMatchmaker, searching for a match with 2 players
  async joinMatchmakerPool(mode: 'classic' | 'timed' = 'classic'): Promise<any> {
    if (!this.socket) {
      throw new Error("Socket is not initialized. Call connectSocket() first.");
    }

    // addMatchmaker syntax: query, min_count, max_count, string_properties, numeric_properties
    const matchmakerTicket = await this.socket.addMatchmaker("*", 2, 2, { "mode": mode }, { "tictactoe": 1 });
    return matchmakerTicket;
  }

  // Fetch the top 10 players from the leaderboard
  async listLeaderboardRecords(): Promise<any> {
    if (!this.session) {
      throw new Error("Session is not initialized. Must authenticate first.");
    }
    // listLeaderboardRecords syntax: session, leaderboard_id, owner_ids, limit, cursor, expiry
    const result = await this.client.listLeaderboardRecords(this.session, "tictactoe_global", undefined, 10);
    return result;
  }
}

// Export as a singleton
export const nakamaService = new NakamaService();
export default nakamaService;
