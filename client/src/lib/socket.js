import { io } from 'socket.io-client';
import { getAccessToken } from './api.js';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;

export function createStaffSocket() {
  return io(SOCKET_URL, {
    withCredentials: true,
    auth: {
      token: getAccessToken(),
    },
    transports: ['websocket', 'polling'],
  });
}

export function createGuestSocket() {
  return io(SOCKET_URL, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });
}
