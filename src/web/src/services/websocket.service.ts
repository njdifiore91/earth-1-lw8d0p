/**
 * WebSocket Service for Matter Satellite Data Product Matching Platform
 * @version 1.0.0
 * Implements secure, resilient real-time communication for search updates,
 * collection planning progress, and result notifications
 */

// External imports - versions specified for dependency management
import ReconnectingWebSocket from 'reconnecting-websocket'; // ^4.4.0
import retry from 'retry'; // ^0.13.1
import winston from 'winston'; // ^3.8.2

// Internal imports
import { ApiResponse, SearchApiTypes, WebSocketError } from '../types/api.types';
import { apiConfig } from '../config/api.config';
import { AuthService } from './auth.service';

/**
 * Interface for WebSocket message structure with validation
 */
interface WebSocketMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp: number;
  messageId: string;
  version: string;
}

/**
 * Type definition for subscription callbacks with error handling
 */
type SubscriptionCallback<T = unknown> = (
  data: T | null,
  error?: WebSocketError,
  metadata?: Record<string, unknown>
) => void;

/**
 * Queue implementation for message persistence during disconnections
 */
class MessageQueue<T> {
  private queue: T[] = [];
  private readonly maxSize: number = 1000;

  public enqueue(message: T): void {
    if (this.queue.length >= this.maxSize) {
      this.queue.shift();
    }
    this.queue.push(message);
  }

  public dequeueAll(): T[] {
    const messages = [...this.queue];
    this.queue = [];
    return messages;
  }
}

/**
 * Enhanced WebSocket service with security, monitoring, and reliability features
 */
export class WebSocketService {
  private socket: ReconnectingWebSocket | null = null;
  private readonly authService: AuthService;
  private readonly logger: winston.Logger;
  private readonly subscriptions: Map<string, Set<SubscriptionCallback>> = new Map();
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private readonly messageQueue: MessageQueue<WebSocketMessage> = new MessageQueue();
  private lastHeartbeat: number = Date.now();
  private heartbeatInterval: NodeJS.Timer | null = null;
  private readonly VERSION = '1.0.0';

  constructor(authService: AuthService, logger: winston.Logger) {
    this.authService = authService;
    this.logger = logger;
    this.initializeHeartbeat();
  }

  /**
   * Establishes secure WebSocket connection with token validation
   */
  public async connect(): Promise<void> {
    try {
      const token = await this.authService.getAccessToken();
      const wsUrl = this.buildSecureWebSocketUrl(token);

      this.socket = new ReconnectingWebSocket(wsUrl, [], {
        maxRetries: 10,
        minReconnectionDelay: 1000,
        maxReconnectionDelay: 30000,
        reconnectionDelayGrowFactor: 1.5,
        connectionTimeout: 4000,
      });

      this.setupEventHandlers();
      this.startHeartbeat();

      this.logger.info('WebSocket connection initialized');
    } catch (error) {
      this.logger.error('WebSocket connection failed', { error });
      throw error;
    }
  }

  /**
   * Manages search subscriptions with enhanced error handling
   */
  public async subscribeToSearch(
    searchId: string,
    callback: SubscriptionCallback<SearchApiTypes.SearchResponse>,
    options: { retryOnError?: boolean; timeout?: number } = {}
  ): Promise<void> {
    if (!this.socket) {
      throw new Error('WebSocket not initialized');
    }

    const operation = retry.operation({
      retries: options.retryOnError ? 3 : 0,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 10000,
    });

    operation.attempt(async () => {
      try {
        if (!this.subscriptions.has(searchId)) {
          this.subscriptions.set(searchId, new Set());
        }

        this.subscriptions.get(searchId)!.add(callback);

        const subscribeMessage: WebSocketMessage = {
          type: 'SUBSCRIBE_SEARCH',
          payload: { searchId },
          timestamp: Date.now(),
          messageId: crypto.randomUUID(),
          version: this.VERSION,
        };

        this.socket!.send(JSON.stringify(subscribeMessage));
        this.logger.info('Subscribed to search updates', { searchId });
      } catch (error) {
        if (operation.retry(error as Error)) {
          return;
        }
        this.logger.error('Search subscription failed', { searchId, error });
        throw error;
      }
    });
  }

  /**
   * Unsubscribes from search updates with cleanup
   */
  public unsubscribeFromSearch(searchId: string, callback: SubscriptionCallback): void {
    const subscribers = this.subscriptions.get(searchId);
    if (subscribers) {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        this.subscriptions.delete(searchId);
        this.sendUnsubscribeMessage(searchId);
      }
    }
  }

  /**
   * Retrieves current connection status with diagnostics
   */
  public getConnectionStatus(): { 
    connected: boolean; 
    lastHeartbeat: number; 
    reconnectAttempts: number;
  } {
    return {
      connected: this.isConnected,
      lastHeartbeat: this.lastHeartbeat,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  /**
   * Gracefully disconnects WebSocket with cleanup
   */
  public disconnect(): void {
    if (this.socket) {
      this.stopHeartbeat();
      this.socket.close(1000, 'Client disconnecting');
      this.socket = null;
      this.isConnected = false;
      this.subscriptions.clear();
      this.logger.info('WebSocket disconnected');
    }
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.addEventListener('open', this.handleOpen.bind(this));
    this.socket.addEventListener('message', this.handleMessage.bind(this));
    this.socket.addEventListener('close', this.handleClose.bind(this));
    this.socket.addEventListener('error', this.handleError.bind(this));
  }

  private async handleOpen(): Promise<void> {
    this.isConnected = true;
    this.reconnectAttempts = 0;
    await this.processQueuedMessages();
    this.logger.info('WebSocket connection established');
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      this.validateMessage(message);
      this.updateLastHeartbeat();

      if (message.type === 'SEARCH_UPDATE') {
        this.handleSearchUpdate(message);
      } else if (message.type === 'HEARTBEAT') {
        this.handleHeartbeat(message);
      }
    } catch (error) {
      this.logger.error('Error processing WebSocket message', { error, data: event.data });
    }
  }

  private handleClose(event: CloseEvent): void {
    this.isConnected = false;
    this.logger.warn('WebSocket connection closed', { 
      code: event.code, 
      reason: event.reason 
    });
    this.handleReconnection();
  }

  private handleError(error: Event): void {
    this.logger.error('WebSocket error occurred', { error });
    this.handleReconnection();
  }

  private async handleReconnection(): Promise<void> {
    this.reconnectAttempts++;
    try {
      const token = await this.authService.refreshToken();
      const wsUrl = this.buildSecureWebSocketUrl(token);
      if (this.socket) {
        this.socket.url = wsUrl;
      }
    } catch (error) {
      this.logger.error('Token refresh failed during reconnection', { error });
    }
  }

  private handleSearchUpdate(message: WebSocketMessage<SearchApiTypes.SearchResponse>): void {
    const searchId = message.payload.results[0]?.id;
    const subscribers = this.subscriptions.get(searchId);
    
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(message.payload);
        } catch (error) {
          this.logger.error('Error in search update callback', { searchId, error });
        }
      });
    }
  }

  private validateMessage(message: WebSocketMessage): void {
    if (!message.type || !message.messageId || !message.version) {
      throw new Error('Invalid message format');
    }
    if (message.version !== this.VERSION) {
      this.logger.warn('Version mismatch in message', { 
        expected: this.VERSION, 
        received: message.version 
      });
    }
  }

  private buildSecureWebSocketUrl(token: string): string {
    const wsConfig = apiConfig.serviceConfigs.search;
    return `${wsConfig.baseURL.replace('http', 'ws')}/ws?token=${token}`;
  }

  private initializeHeartbeat(): void {
    const HEARTBEAT_INTERVAL = 30000; // 30 seconds
    const HEARTBEAT_TIMEOUT = 90000; // 90 seconds

    setInterval(() => {
      if (this.isConnected && Date.now() - this.lastHeartbeat > HEARTBEAT_TIMEOUT) {
        this.logger.warn('Heartbeat timeout, reconnecting...');
        this.socket?.close(4000, 'Heartbeat timeout');
      }
    }, HEARTBEAT_INTERVAL);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        this.sendHeartbeat();
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private updateLastHeartbeat(): void {
    this.lastHeartbeat = Date.now();
  }

  private sendHeartbeat(): void {
    const heartbeat: WebSocketMessage = {
      type: 'HEARTBEAT',
      payload: { timestamp: Date.now() },
      timestamp: Date.now(),
      messageId: crypto.randomUUID(),
      version: this.VERSION,
    };
    this.socket?.send(JSON.stringify(heartbeat));
  }

  private async processQueuedMessages(): Promise<void> {
    const messages = this.messageQueue.dequeueAll();
    for (const message of messages) {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify(message));
      }
    }
  }

  private sendUnsubscribeMessage(searchId: string): void {
    const message: WebSocketMessage = {
      type: 'UNSUBSCRIBE_SEARCH',
      payload: { searchId },
      timestamp: Date.now(),
      messageId: crypto.randomUUID(),
      version: this.VERSION,
    };
    this.socket?.send(JSON.stringify(message));
  }
}

export default WebSocketService;