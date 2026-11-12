import { EMAIL_TEMPLATES } from "../../shared/constants.js";
import { env } from "../config/env.js";
import * as emails from "../repositories/email.repository.js";
import * as settings from "../repositories/settings.repository.js";
import { logger } from "../utils/logger.js";

/**
 * Complaint email notifications.
 *
 * Every message is written to `email_outbox` first, then handed to SMTP when a
 * transport is configured. That keeps the complaint request fast and means a
 * mail server outage never blocks the civic workflow. Administrators can edit
 * subject/body templates from Settings; any placeholder written as
 * `{{name}}` is replaced from the event variables.
 */

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export const render = (template, vars = {}) =>
  String(template || "").replace(PLACEHOLDER, (_match, key) =>
    vars[key] === undefined || vars[key] === null ? "" : String(vars[key])
  );

const resolveTemplate = (key, overrides = {}) => {
  const base = EMAIL_TEMPLATES[key] || null;
  const custom = overrides?.[key] || {};

  if (!base && !custom.subject && !custom.body) return null;

  return {
    subject: custom.subject || base?.subject || "Nagarik Bhopal update",
    body: custom.body || base?.body || "",
  };
};

let transporter = null;

const getTransport = async () => {
  if (!env.smtp.enabled) return null;
  if (transporter) return transporter;

  const nodemailer = await import("nodemailer");
  const createTransport = nodemailer.createTransport || nodemailer.default?.createTransport;

  if (typeof createTransport !== "function") {
    throw new Error("nodemailer is not available");
  }

  transporter = createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: env.smtp.user
      ? { user: env.smtp.user, pass: env.smtp.password }
      : undefined,
  });

  return transporter;
};

/** Send one queued row and update its delivery status. Never throws. */
export const deliver = async (record) => {
  if (!record) return null;

  try {
    const transport = await getTransport();

    if (!transport) {
      logger.debug("Email queued without SMTP transport", {
        id: record.id,
        to: record.to_email,
      });
      return record;
    }

    await transport.sendMail({
      from: env.smtp.from,
      to: record.to_email,
      subject: record.subject,
      text: record.body,
    });

    return await emails.markSent(record.id, "smtp");
  } catch (error) {
    logger.warn("Email delivery failed", { id: record.id, error: error.message });
    return emails.markFailed(record.id, error.message, "smtp").catch(() => null);
  }
};

/**
 * Compose and queue an email. Returns the outbox row (or null when the address
 * is missing / email notifications are switched off). Delivery happens in the
 * background so callers are never blocked.
 */
export const queueEmail = async (
  { to, templateKey, vars = {}, complaintId = "" },
  db = null
) => {
  const address = String(to || "").trim();
  if (!address) return null;

  let config;

  try {
    config = await settings.get();
  } catch {
    config = {};
  }

  if (config.emailNotifications === false) return null;

  const template = resolveTemplate(templateKey, config.emailTemplates);
  if (!template) return null;

  const subject = render(template.subject, vars).slice(0, 200);
  const body = render(template.body, vars);

  let record;

  try {
    record = await emails.enqueue(
      {
        to: address,
        subject,
        body,
        templateKey,
        complaintId,
        status: env.smtp.enabled ? "queued" : "queued",
        transport: env.smtp.enabled ? "smtp" : "",
      },
      db
    );
  } catch (error) {
    logger.warn("Could not queue email", { templateKey, error: error.message });
    return null;
  }

  // Fire-and-forget: the request returns immediately even if SMTP is slow.
  void deliver(record);

  return record;
};

export const list = async (limit = 100) => {
  const rows = await emails.list(limit);
  return {
    items: rows.map((row) => ({
      id: Number(row.id),
      to: row.to_email,
      subject: row.subject,
      body: row.body,
      templateKey: row.template_key || "",
      status: row.status,
      transport: row.transport || "",
      error: row.error || "",
      complaintId: row.complaint_id || "",
      citizenName: row.citizen_name || "",
      createdAt: row.created_at,
      sentAt: row.sent_at,
    })),
  };
};

export default { queueEmail, deliver, render, list };
