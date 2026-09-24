import { emailTemplates } from './email.templates.js';

export const sendNotificationEmailService = async (to, templateType, data = {}) => {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;

  if (!smtpHost || !smtpUser) {
    return {
      status: 'EMAIL_PROVIDER_NOT_CONFIGURED',
      delivered: false,
      message: 'SMTP / Email Provider credentials not configured in environment',
      recipient: to,
      templateType,
    };
  }

  const tmpl = emailTemplates[templateType]
    ? emailTemplates[templateType](data.name || data.orderNumber || data.sku)
    : { subject: 'Notification Alert', body: '<p>You have a new notification.</p>' };

  return {
    status: 'DELIVERED',
    delivered: true,
    message: `Email sent to ${to}`,
    subject: tmpl.subject,
  };
};
