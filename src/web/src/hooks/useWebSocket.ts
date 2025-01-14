/**
 * Enhanced WebSocket Hook for Matter Satellite Data Product Matching Platform
 * @version 1.0.0
 * Implements secure WebSocket communication with comprehensive error handling,
 * automatic reconnection, and monitoring capabilities
 */

// External imports - versions specified for dependency management
import { useState, useEffect, useCallback, useRef } from 'react'; // v18.2.0

// Internal imports
import { WebSocketService } from '../services/websocket.service';
import { ApiResponse, WebSocketError, ConnectionMetrics } from '../types/api.types';

/**
 * Enhanced WebSocket security configuration
 */
interface WebSocketSecurityConfig {
  validateTokens: boolean;
  enableEncryption: boolean;
  allowedOrigins: string[];
  heartbeatTimeout: number;
}

/**
 * Enhanced WebSocket connection state
 */
type WebSocketConnectionState = 
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error';

/**
 * Enhanced WebSocket hook configuration options
 */
interface UseWebSocketOptions {
  url: string;
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectInterval?: number;
  heartbeatInterval?: number;
  tokenRefreshCallback?: () => Promise<string>;
  errorHandler?: (error: WebSocketError) => void;
  securityOptions?: WebSocketSecurityConfig;
}

/**
 * Enhanced WebSocket hook return interface
 */
interface UseWebSocketReturn {
  isConnected: boolean;
  connectionState: WebSocketConnectionState;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (message: any) => Promise<boolean>;
  subscribe: (event: string, callback: Function) => void;
  unsubscribe: (event: string, callback: Function) => void;
  connectionMetrics: ConnectionMetrics;
  resetConnection: () => Promise<void>;
}

/**
 * Enhanced WebSocket hook with comprehensive security and monitoring
 */
export function useWebSocket({
  url,
  autoConnect = true,
  reconnectAttempts = 5,
  reconnectInterval = 5000,
  heartbeatInterval = 30000,
  tokenRefreshCallback,
  errorHandler,
  securityOptions = {
    validateTokens: true,
    enableEncryption: true,
    allowedOrigins: [],
    heartbeatTimeout: 90000
  }
}: UseWebSocketOptions): UseWebSocketReturn {
  // State management
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>('disconnected');
  const [connectionMetrics, setConnectionMetrics] = useState<ConnectionMetrics>({
    latency: 0,
    messageCount: 0,
    errorCount: 0,
    reconnectCount: 0,
    lastHeartbeat: null
  });

  // Refs for persistent data
  const wsService = useRef<WebSocketService | null>(null);
  const reconnectCount = useRef<number>(0);
  const heartbeatTimer = useRef<NodeJS.Timer | null>(null);
  const subscriptions = useRef<Map<string, Set<Function>>>(new Map());

  /**
   * Initialize WebSocket service with security configuration
   */
  const initializeService = useCallback(async () => {
    if (!wsService.current) {
      wsService.current = new WebSocketService();
      await wsService.current.validateConnection(securityOptions);
    }
  }, [securityOptions]);

  /**
   * Enhanced connection establishment with security validation
   */
  const connect = useCallback(async () => {
    try {
      setConnectionState('connecting');
      await initializeService();

      if (tokenRefreshCallback) {
        const token = await tokenRefreshCallback();
        await wsService.current?.connect(url, token);
      } else {
        await wsService.current?.connect(url);
      }

      setIsConnected(true);
      setConnectionState('connected');
      reconnectCount.current = 0;
      startHeartbeat();

    } catch (error) {
      handleError(error as WebSocketError);
    }
  }, [url, tokenRefreshCallback, initializeService]);

  /**
   * Graceful disconnection with cleanup
   */
  const disconnect = useCallback(() => {
    wsService.current?.disconnect();
    setIsConnected(false);
    setConnectionState('disconnected');
    stopHeartbeat();
    subscriptions.current.clear();
  }, []);

  /**
   * Enhanced message sending with delivery confirmation
   */
  const sendMessage = useCallback(async (message: any): Promise<boolean> => {
    if (!isConnected || !wsService.current) {
      throw new Error('WebSocket not connected');
    }

    try {
      await wsService.current.sendMessage(message);
      updateMetrics({ messageCount: connectionMetrics.messageCount + 1 });
      return true;
    } catch (error) {
      handleError(error as WebSocketError);
      return false;
    }
  }, [isConnected, connectionMetrics.messageCount]);

  /**
   * Event subscription management
   */
  const subscribe = useCallback((event: string, callback: Function) => {
    if (!subscriptions.current.has(event)) {
      subscriptions.current.set(event, new Set());
    }
    subscriptions.current.get(event)?.add(callback);
    wsService.current?.subscribe(event, callback);
  }, []);

  /**
   * Event unsubscription with cleanup
   */
  const unsubscribe = useCallback((event: string, callback: Function) => {
    const callbacks = subscriptions.current.get(event);
    if (callbacks) {
      callbacks.delete(callback);
      wsService.current?.unsubscribe(event, callback);
      if (callbacks.size === 0) {
        subscriptions.current.delete(event);
      }
    }
  }, []);

  /**
   * Force connection reset with state cleanup
   */
  const resetConnection = useCallback(async () => {
    disconnect();
    reconnectCount.current = 0;
    await connect();
  }, [disconnect, connect]);

  /**
   * Enhanced error handling with monitoring
   */
  const handleError = useCallback((error: WebSocketError) => {
    setConnectionState('error');
    updateMetrics({ errorCount: connectionMetrics.errorCount + 1 });
    
    if (errorHandler) {
      errorHandler(error);
    }

    if (reconnectCount.current < reconnectAttempts) {
      setConnectionState('reconnecting');
      reconnectCount.current++;
      setTimeout(() => connect(), reconnectInterval);
    }
  }, [connectionMetrics.errorCount, reconnectAttempts, reconnectInterval, connect, errorHandler]);

  /**
   * Heartbeat monitoring setup
   */
  const startHeartbeat = useCallback(() => {
    if (heartbeatTimer.current) {
      clearInterval(heartbeatTimer.current);
    }

    heartbeatTimer.current = setInterval(() => {
      if (isConnected && wsService.current) {
        wsService.current.sendMessage({ type: 'heartbeat', timestamp: Date.now() });
        updateMetrics({ lastHeartbeat: new Date() });
      }
    }, heartbeatInterval);
  }, [isConnected, heartbeatInterval]);

  /**
   * Heartbeat cleanup
   */
  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimer.current) {
      clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = null;
    }
  }, []);

  /**
   * Metrics update utility
   */
  const updateMetrics = useCallback((updates: Partial<ConnectionMetrics>) => {
    setConnectionMetrics(prev => ({
      ...prev,
      ...updates
    }));
  }, []);

  /**
   * Effect for automatic connection
   */
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    isConnected,
    connectionState,
    connect,
    disconnect,
    sendMessage,
    subscribe,
    unsubscribe,
    connectionMetrics,
    resetConnection
  };
}

export default useWebSocket;