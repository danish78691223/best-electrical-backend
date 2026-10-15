function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(name + ' is not configured on the backend.');
  return value;
}

async function readProviderResponse(response) {
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
  if (!response.ok) {
    const message = data.error?.message || data.message || data.error || ('Provider returned HTTP ' + response.status);
    throw new Error(String(message).slice(0, 450));
  }
  return data;
}

/**
 * Generic JSON SMS adapter. Configure SMS_API_URL to a gateway adapter that accepts
 * { to, message, senderId } and accepts a Bearer token. Provider APIs vary; do not
 * enable this until the chosen gateway contract and DLT templates have been verified.
 */
export async function sendSms({ to, message }) {
  const url = requireEnv('SMS_API_URL');
  const token = requireEnv('SMS_API_TOKEN');
  const senderId = requireEnv('SMS_SENDER_ID');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ to, message, senderId }),
    signal: AbortSignal.timeout(15000)
  });
  const data = await readProviderResponse(response);
  return {
    providerMessageId: String(data.messageId || data.message_id || data.requestId || data.id || ''),
    providerResponse: data
  };
}

/**
 * Sends a pre-approved WhatsApp Business template. The approved template must have
 * one body variable ({{1}}) and WHATSAPP_TEMPLATE_BODY_VARIABLE must remain "true".
 * Business-initiated promotional templates need to be approved by Meta.
 */
export async function sendWhatsAppTemplate({ to, message }) {
  const token = requireEnv('WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = requireEnv('WHATSAPP_PHONE_NUMBER_ID');
  const templateName = requireEnv('WHATSAPP_TEMPLATE_NAME');
  const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en';
  const version = requireEnv('WHATSAPP_GRAPH_API_VERSION');
  if (!/^v\d+\.\d+$/.test(version)) throw new Error('WHATSAPP_GRAPH_API_VERSION must look like vNN.N.');
  if (process.env.WHATSAPP_TEMPLATE_BODY_VARIABLE !== 'true') {
    throw new Error('Set WHATSAPP_TEMPLATE_BODY_VARIABLE=true and use an approved template with a {{1}} body variable so the campaign message can be inserted.');
  }
  const response = await fetch('https://graph.facebook.com/' + version + '/' + encodeURIComponent(phoneNumberId) + '/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: String(to).replace(/^\+/, ''),
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        components: [{ type: 'body', parameters: [{ type: 'text', text: String(message).slice(0, 1024) }] }]
      }
    }),
    signal: AbortSignal.timeout(15000)
  });
  const data = await readProviderResponse(response);
  return { providerMessageId: String(data.messages?.[0]?.id || ''), providerResponse: data };
}

export function isChannelConfigured(channel) {
  if (channel === 'sms') return Boolean(process.env.SMS_API_URL && process.env.SMS_API_TOKEN && process.env.SMS_SENDER_ID);
  if (channel === 'whatsapp') return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_TEMPLATE_NAME &&
    process.env.WHATSAPP_GRAPH_API_VERSION &&
    process.env.WHATSAPP_TEMPLATE_BODY_VARIABLE === 'true'
  );
  return false;
}
