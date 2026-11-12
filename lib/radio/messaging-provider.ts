/**
 * Messaging Provider Interface for Station Outbound Communications
 * 
 * Locked Decisions:
 * 1. Internal WAHA is strictly for Operator alerts and Presenter pings.
 * 2. Listener broadcasts/reminders run in DRY-RUN mode until official Cloud API is configured.
 * 3. Never send bulk unsolicited messages to listeners via WAHA to protect the station's number.
 */

import { neonQuery } from "@/lib/supabase-db";
import { hashIdentifier } from "./shoutout-filter";
import { getWhatsAppConfig } from "@/lib/whatsapp";

export interface SendMessageOptions {
  toPhone: string;
  message: string;
  recipientRole: "presenter" | "listener" | "operator";
  messageType: "show_reminder" | "presenter_standby_ping" | "shoutout_ack" | "contest_win";
}

export interface SendMessageResult {
  success: boolean;
  channel: "waha" | "cloud_api" | "dry_run";
  status: "sent" | "failed" | "dry_run_logged" | "opted_out";
  reason?: string;
}

export interface RadioMessagingProvider {
  sendMessage(opts: SendMessageOptions): Promise<SendMessageResult>;
}

/**
 * Default Provider implementation obeying the spec
 */
export class HybridRadioMessagingProvider implements RadioMessagingProvider {
  async sendMessage(opts: SendMessageOptions): Promise<SendMessageResult> {
    const { toPhone, message, recipientRole, messageType } = opts;
    const phoneHash = hashIdentifier(toPhone);

    // 1. If recipient is a listener for reminders or unsolicited messages:
    // MUST BE DRY RUN unless explicitly enabled with official Cloud API env flag
    const enableListenerCloudApi = process.env.ENABLE_WHATSAPP_CLOUD_API === "true";
    const enableListenerAck = process.env.ENABLE_RADIO_WHATSAPP_ACK === "true";

    if (recipientRole === "listener") {
      // Shoutout ACK is allowed if explicit flag enabled (minimal single reply)
      if (messageType === "shoutout_ack" && enableListenerAck) {
        return this.sendViaWaha(toPhone, phoneHash, opts);
      }

      // Show Reminders to listeners MUST default to DRY-RUN unless Cloud API configured
      if (!enableListenerCloudApi) {
        console.log(`[RadioMessagingProvider:DRY_RUN] Reminder for listener ${toPhone.slice(0, 4)}***: "${message}"`);
        await this.logMessage(phoneHash, recipientRole, "dry_run", messageType, message, "dry_run_logged");
        return {
          success: true,
          channel: "dry_run",
          status: "dry_run_logged",
          reason: "Default dry-run mode active. Cloud API provider required for mass listener reminders."
        };
      }
    }

    // 2. Presenter Pings and Operator Alerts:
    // Authorized to use existing WAHA gateway instance
    if (recipientRole === "presenter" || recipientRole === "operator") {
      return this.sendViaWaha(toPhone, phoneHash, opts);
    }

    // Default fallback to dry-run
    await this.logMessage(phoneHash, recipientRole, "dry_run", messageType, message, "dry_run_logged");
    return {
      success: true,
      channel: "dry_run",
      status: "dry_run_logged",
    };
  }

  private async sendViaWaha(
    toPhone: string,
    phoneHash: string,
    opts: SendMessageOptions
  ): Promise<SendMessageResult> {
    try {
      const config = getWhatsAppConfig();
      const chatId = toPhone.includes("@c.us") ? toPhone : `${toPhone.replace(/\D/g, "")}@c.us`;

      const response = await fetch(`${config.url}/api/sendText`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": config.apiKey,
        },
        body: JSON.stringify({
          chatId,
          text: opts.message,
          session: config.sessionId,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.warn(`[RadioMessagingProvider:WAHA] Send failed (${response.status}):`, errText);
        await this.logMessage(phoneHash, opts.recipientRole, "waha", opts.messageType, opts.message, "failed");
        return {
          success: false,
          channel: "waha",
          status: "failed",
          reason: `WAHA HTTP ${response.status}`,
        };
      }

      await this.logMessage(phoneHash, opts.recipientRole, "waha", opts.messageType, opts.message, "sent");
      return {
        success: true,
        channel: "waha",
        status: "sent",
      };
    } catch (err: any) {
      console.error("[RadioMessagingProvider:WAHA] Network error:", err.message);
      await this.logMessage(phoneHash, opts.recipientRole, "waha", opts.messageType, opts.message, "failed");
      return {
        success: false,
        channel: "waha",
        status: "failed",
        reason: err.message,
      };
    }
  }

  private async logMessage(
    phoneHash: string,
    role: string,
    channel: string,
    type: string,
    content: string,
    status: string
  ) {
    try {
      await neonQuery(
        `INSERT INTO radio_messaging_log 
         (recipient_phone_hash, recipient_role, channel, message_type, content_preview, status)
         VALUES ($1, $2, $3, $4, $5, $6);`,
        [phoneHash, role, channel, type, content.slice(0, 100), status]
      );
    } catch (e: any) {
      // Table may not exist yet if unmigrated; log gracefully
      console.warn("[RadioMessagingProvider] Error writing message log:", e.message);
    }
  }
}

export const radioMessaging = new HybridRadioMessagingProvider();
