import { Client, Session, Socket } from '@heroiclabs/nakama-js';

// Initialize the Nakama client
export const client = new Client("defaultkey", "127.0.0.1", "7350");

// Store the socket and session instances
export let socket: Socket | null = null;
export let session: Session | null = null;

// Authenticate using device ID
export const authenticate = async (): Promise<boolean> => {
  try {
    // Generate or retrieve a persistent device ID
    let deviceId = localStorage.getItem('nakama_device_id');
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('nakama_device_id', deviceId);
    }
    
    session = await client.authenticateDevice(deviceId, true);
    
    // Create and connect socket
    socket = client.createSocket(false, false);
    await socket.connect(session, true);
    
    return true;
  } catch (error) {
    console.error("Failed to authenticate with Nakama:", error);
    return false;
  }
};
