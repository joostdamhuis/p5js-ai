import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { LogMessage } from './Console';

interface WebSocketListenerProps {
  onCodeUpdate: (code: string) => void;
  onExecutionControl?: (action: 'start' | 'stop' | 'toggle') => void;
  onConsoleControl?: (action: 'clear' | 'message' | 'height', data?: any) => void;
  onFileControl?: (action: 'select' | 'close' | 'create' | 'delete', data?: any) => void;
  onLayoutControl?: (action: 'sidebar' | 'projectName', data?: any) => void;
  onNavigationControl?: (action: 'dashboard') => void;
  onStatusChange?: (status: McpStatus) => void;
  serverUrl?: string;
}

export type McpStatus = 'connecting' | 'connected' | 'offline';

const WebSocketListener = ({
  onCodeUpdate,
  onExecutionControl,
  onConsoleControl,
  onFileControl,
  onLayoutControl,
  onNavigationControl,
  onStatusChange,
  serverUrl = 'http://localhost:3001'
}: WebSocketListenerProps) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);

  // Use refs to store the latest callback references
  const callbacksRef = useRef({
    onCodeUpdate,
    onExecutionControl,
    onConsoleControl,
    onFileControl,
    onLayoutControl,
    onNavigationControl
  });

  // Add heartbeat ref
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  // Update refs when callbacks change
  useEffect(() => {
    callbacksRef.current = {
      onCodeUpdate,
      onExecutionControl,
      onConsoleControl,
      onFileControl,
      onLayoutControl,
      onNavigationControl
    };
  }, [onCodeUpdate, onExecutionControl, onConsoleControl, onFileControl, onLayoutControl, onNavigationControl]);

  // Stable connection setup effect - only depends on serverUrl
  useEffect(() => {
    console.log(`🔌 [WebSocket] Initializing connection to ${serverUrl}...`);
    setConnectionAttempts(0);

    const newSocket = io(serverUrl, {
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      autoConnect: true,
      forceNew: false, // Don't force new connection - reuse existing if possible
      transports: ['websocket', 'polling'], // Try websocket first, fallback to polling
      timeout: 20000, // Increase timeout
      // Add these options to handle React StrictMode better
      upgrade: true,
      rememberUpgrade: true,
      // Add connection persistence options
      closeOnBeforeunload: false, // Don't close on page unload
    });

    setSocket(newSocket);

    // Connection event handlers
    newSocket.on('connect', () => {
      setConnected(true);
      setError(null);
      setConnectionAttempts(0);
      console.log(`🔌 [WebSocket] Successfully connected to MCP server at ${serverUrl}`);
      console.log(`🔌 [WebSocket] Socket ID: ${newSocket.id}`);
      console.log(`🔌 [WebSocket] Transport: ${newSocket.io.engine.transport.name}`);

      // Start heartbeat to keep connection alive
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      heartbeatRef.current = setInterval(() => {
        if (newSocket.connected) {
          console.log('💓 [WebSocket] Sending heartbeat ping...');
          newSocket.emit('ping', { timestamp: Date.now() });
        }
      }, 15000); // Send ping every 15 seconds
    });

    newSocket.on('disconnect', (reason) => {
      setConnected(false);
      console.log(`🔌 [WebSocket] Disconnected from MCP server. Reason: ${reason}`);

      // Clear heartbeat on disconnect
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      // Don't immediately try to reconnect for certain reasons
      if (reason === 'io client disconnect' || reason === 'transport close') {
        console.log(`🔌 [WebSocket] Clean disconnect, not attempting reconnection`);
      }
    });

    newSocket.on('connect_error', (err) => {
      setConnected(false);
      setConnectionAttempts(prev => prev + 1);
      const errorMsg = `Connection error: ${err.message}`;
      setError(errorMsg);
      console.error(`🔌 [WebSocket] Connection error (attempt ${connectionAttempts + 1}):`, err);
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log(`🔌 [WebSocket] Reconnected after ${attemptNumber} attempts`);
      setConnected(true);
      setError(null);
    });

    newSocket.on('reconnect_error', (err) => {
      console.error(`🔌 [WebSocket] Reconnection error:`, err);
    });

    newSocket.on('reconnect_failed', () => {
      console.error(`🔌 [WebSocket] Failed to reconnect after maximum attempts`);
      setError('Failed to reconnect to MCP server');
    });

    // Handle welcome message from server
    newSocket.on('welcome', (data) => {
      console.log(`🔌 [WebSocket] Received welcome from server:`, data);
    });

    // Event listeners using stable callback refs
    newSocket.on('codeUpdate', (data: { code: string }) => {
      console.log('📝 [MCP] Received code update:', data.code.substring(0, 50) + '...');
      if (data && data.code) {
        callbacksRef.current.onCodeUpdate(data.code);
      }
    });

    newSocket.on('startExecution', () => {
      console.log('▶️ [MCP] Received start execution command');
      callbacksRef.current.onExecutionControl?.('start');
    });

    newSocket.on('stopExecution', () => {
      console.log('⏹️ [MCP] Received stop execution command');
      callbacksRef.current.onExecutionControl?.('stop');
    });

    newSocket.on('toggleExecution', () => {
      console.log('🔄 [MCP] Received toggle execution command');
      callbacksRef.current.onExecutionControl?.('toggle');
    });

    newSocket.on('clearConsole', () => {
      console.log('🧹 [MCP] Received clear console command');
      callbacksRef.current.onConsoleControl?.('clear');
    });

    newSocket.on('addConsoleMessage', (data: LogMessage) => {
      console.log('📱 [MCP] Received add console message command:', data);
      callbacksRef.current.onConsoleControl?.('message', data);
    });

    newSocket.on('setConsoleHeight', (height: number) => {
      console.log('📏 [MCP] Received set console height command:', height);
      callbacksRef.current.onConsoleControl?.('height', height);
    });

    newSocket.on('selectFile', (fileId: string) => {
      console.log('📂 [MCP] Received select file command:', fileId);
      callbacksRef.current.onFileControl?.('select', fileId);
    });

    newSocket.on('closeTab', (fileId: string) => {
      console.log('❌ [MCP] Received close tab command:', fileId);
      callbacksRef.current.onFileControl?.('close', fileId);
    });

    newSocket.on('createFile', (fileData: { name: string; content: string }) => {
      console.log('📄 [MCP] Received create file command:', fileData);
      callbacksRef.current.onFileControl?.('create', fileData);
    });

    newSocket.on('deleteFile', (fileId: string) => {
      console.log('🗑️ [MCP] Received delete file command:', fileId);
      callbacksRef.current.onFileControl?.('delete', fileId);
    });

    newSocket.on('toggleSidebar', () => {
      console.log('📋 [MCP] Received toggle sidebar command');
      callbacksRef.current.onLayoutControl?.('sidebar');
    });

    newSocket.on('updateProjectName', (name: string) => {
      console.log('🎨 [MCP] Received update project name command:', name);
      callbacksRef.current.onLayoutControl?.('projectName', name);
    });

    newSocket.on('backToDashboard', () => {
      console.log('🧭 [MCP] Received back to dashboard command');
      callbacksRef.current.onNavigationControl?.('dashboard');
    });

    // Handle pong response from server
    newSocket.on('pong', (data) => {
      console.log('💓 [WebSocket] Received pong from server:', data);
    });

    // Log all incoming events for debugging
    newSocket.onAny((eventName, ...args) => {
      console.log(`📨 [MCP] WebSocket event: ${eventName}`, args);
    });

    // Improved cleanup function
    return () => {
      console.log('🔌 [WebSocket] Cleaning up connection...');

      // Clear heartbeat
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      // Only disconnect if the socket is actually connected
      if (newSocket.connected) {
        console.log('🔌 [WebSocket] Socket is connected, performing clean disconnect...');
        newSocket.removeAllListeners();
        newSocket.disconnect();
      } else {
        console.log('🔌 [WebSocket] Socket already disconnected, just removing listeners...');
        newSocket.removeAllListeners();
      }
    };
  }, [serverUrl]); // Only serverUrl as dependency

  // Status is shown in the page header (MCP button), not as an overlay
  useEffect(() => {
    onStatusChange?.(connected ? 'connected' : error ? 'offline' : 'connecting');
  }, [connected, error, onStatusChange]);

  return null;
};

export default WebSocketListener; 