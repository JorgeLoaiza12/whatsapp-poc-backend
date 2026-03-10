import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { WebhookService, IMessageEmitter } from '../whatsapp/webhook.service';

/**
 * WebSocket Gateway — namespace /chat
 *
 * Authentication: clients pass the JWT in the handshake auth object:
 *   socket = io('/chat', { auth: { token: '<jwt>' } })
 *
 * Rooms:
 *   - tenant:<tenantId>  — all connected agents of a tenant receive broadcast events
 *   - conversation:<id>  — joined on demand via 'join-conversation' event
 */
@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class ChatGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    IMessageEmitter
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly webhookService: WebhookService,
  ) {}

  /** Register self as the emitter once all providers are ready */
  onModuleInit() {
    this.webhookService.registerEmitter(this);
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth as Record<string, string>)?.token ??
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      const payload = this.jwtService.verify<{
        sub: string;
        tenantId: string;
      }>(token);

      client.data.tenantId = payload.tenantId;
      await client.join(`tenant:${payload.tenantId}`);
      this.logger.log(
        `Connected: ${client.id} → tenant:${payload.tenantId}`,
      );
    } catch {
      this.logger.warn(`Unauthorized WS connection rejected: ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-conversation')
  async joinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: string,
  ) {
    await client.join(`conversation:${conversationId}`);
  }

  // ─── Emitter interface ─────────────────────────────────────────────────────

  /** Broadcasts a new inbound message to all agents of a tenant */
  emitNewMessage(tenantId: string, payload: unknown): void {
    this.server.to(`tenant:${tenantId}`).emit('new-message', payload);
  }

  /** Broadcasts a status update (delivered, read, failed) */
  emitMessageStatus(
    tenantId: string,
    waMessageId: string,
    status: string,
  ): void {
    this.server
      .to(`tenant:${tenantId}`)
      .emit('message-status', { waMessageId, status });
  }
}
