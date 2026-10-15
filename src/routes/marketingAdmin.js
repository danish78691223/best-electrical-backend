import crypto from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { mongoReady } from '../config/db.js';
import MarketingCustomer from '../models/MarketingCustomer.js';
import MarketingCampaign from '../models/MarketingCampaign.js';
import MarketingCampaignRecipient from '../models/MarketingCampaignRecipient.js';
import { isChannelConfigured } from '../services/marketingProviders.js';

const router = express.Router();
const validChannels = new Set(['sms', 'whatsapp']);

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

router.use((req, res, next) => {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected || expected.length < 24) {
    return res.status(503).json({ error: 'Marketing admin API is locked. Configure ADMIN_API_KEY (at least 24 characters) in the backend environment.' });
  }
  if (!safeEqual(req.get('x-admin-key'), expected)) {
    return res.status(401).json({ error: 'Admin key is missing or incorrect.' });
  }
  if (!mongoReady()) return res.status(503).json({ error: 'MongoDB is required for persistent contact and campaign records.' });
  next();
});

function normalizeIndianPhone(input) {
  let value = String(input || '').trim();
  if (!value) return null;
  const hasPlus = value.startsWith('+');
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('0091')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  if (digits.length === 10) digits = '91' + digits;
  if (!hasPlus && digits.length === 12 && digits.startsWith('91')) {
    // A bare Indian country code is accepted.
  } else if (hasPlus && digits.length >= 10 && digits.length <= 15) {
    // E.164 length validation below.
  } else if (!(digits.length >= 10 && digits.length <= 15)) {
    return null;
  }
  if (digits.length < 10 || digits.length > 15 || digits.startsWith('0')) return null;
  return '+' + digits;
}

function cleanContact(item) {
  const phone = normalizeIndianPhone(item?.phone || item?.number || item?.mobile);
  if (!phone) return null;
  return {
    phone,
    name: String(item?.name || '').trim().slice(0, 120),
    source: String(item?.source || 'address-book-import').trim().slice(0, 80) || 'address-book-import'
  };
}

function channelSelection(channels) {
  if (!Array.isArray(channels)) return [];
  return [...new Set(channels.map(x => String(x).toLowerCase()).filter(x => validChannels.has(x)))];
}

async function findEligible(channels) {
  const customers = await MarketingCustomer.find({ doNotContact: { $ne: true } }).lean();
  const recipients = [];
  for (const customer of customers) {
    for (const channel of channels) {
      if (channel === 'sms' && customer.smsConsent === true) recipients.push({ customer, channel });
      if (channel === 'whatsapp' && customer.whatsappConsent === true) recipients.push({ customer, channel });
    }
  }
  return recipients;
}

router.get('/contacts', async (req, res) => {
  try {
    const [customers, total] = await Promise.all([
      MarketingCustomer.find().sort({ updatedAt: -1 }).limit(5000).lean(),
      MarketingCustomer.countDocuments()
    ]);
    res.json({ total, customers: customers.map(x => ({
      id: String(x._id), name: x.name || '', phone: x.phone, source: x.source || '',
      smsConsent: Boolean(x.smsConsent), whatsappConsent: Boolean(x.whatsappConsent),
      doNotContact: Boolean(x.doNotContact),
      smsConsentAt: x.smsConsentAt || null, whatsappConsentAt: x.whatsappConsentAt || null,
      smsConsentSource: x.smsConsentSource || '', whatsappConsentSource: x.whatsappConsentSource || '',
      updatedAt: x.updatedAt
    })) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/contacts/import', async (req, res) => {
  const input = req.body?.contacts;
  if (!Array.isArray(input)) return res.status(400).json({ error: 'contacts must be an array.' });
  if (input.length > 5000) return res.status(413).json({ error: 'Import is limited to 5,000 contact rows per request. Split larger files into smaller batches.' });
  try {
    const deduped = new Map();
    let invalid = 0;
    for (const row of input) {
      const clean = cleanContact(row);
      if (!clean) { invalid++; continue; }
      const old = deduped.get(clean.phone);
      if (!old || (!old.name && clean.name)) deduped.set(clean.phone, clean);
    }
    const now = new Date();
    const operations = [...deduped.values()].map(item => ({
      updateOne: {
        filter: { phone: item.phone },
        update: {
          $set: { name: item.name, source: item.source, lastSyncedAt: now },
          // Import never grants marketing consent. Existing consent fields are preserved.
          $setOnInsert: { smsConsent: false, whatsappConsent: false, doNotContact: false }
        },
        upsert: true
      }
    }));
    const result = operations.length
      ? await MarketingCustomer.bulkWrite(operations, { ordered: false })
      : { upsertedCount: 0, matchedCount: 0 };
    const created = result.upsertedCount || 0;
    const updated = result.matchedCount || 0;
    res.status(201).json({
      totalRows: input.length, validUnique: deduped.size, created, updated, invalid,
      message: 'Contacts imported. Newly imported contacts are NOT opted in to SMS or WhatsApp marketing.'
    });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.patch('/contacts/:id/consent', async (req, res) => {
  const { channel, enabled, consentSource } = req.body || {};
  if (!validChannels.has(channel) || typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Provide channel=sms|whatsapp and enabled=true|false.' });
  }
  const source = String(consentSource || '').trim().slice(0, 240);
  if (enabled && source.length < 8) {
    return res.status(400).json({ error: 'Record how and when customer consent was obtained (at least 8 characters).' });
  }
  try {
    const customer = await MarketingCustomer.findById(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });
    const now = new Date();
    if (channel === 'sms') {
      customer.smsConsent = enabled;
      customer.smsConsentAt = enabled ? now : null;
      customer.smsConsentSource = enabled ? source : '';
    } else {
      customer.whatsappConsent = enabled;
      customer.whatsappConsentAt = enabled ? now : null;
      customer.whatsappConsentSource = enabled ? source : '';
    }
    customer.consentHistory.push({ channel, granted: enabled, source: source || 'Consent withdrawn in admin', recordedAt: now });
    if (customer.consentHistory.length > 100) customer.consentHistory = customer.consentHistory.slice(-100);
    await customer.save();
    res.json({
      customer: {
        id: String(customer._id), name: customer.name, phone: customer.phone,
        smsConsent: customer.smsConsent, whatsappConsent: customer.whatsappConsent,
        smsConsentAt: customer.smsConsentAt, whatsappConsentAt: customer.whatsappConsentAt,
        smsConsentSource: customer.smsConsentSource, whatsappConsentSource: customer.whatsappConsentSource
      },
      message: enabled ? 'Consent record saved.' : 'Channel consent withdrawn; future campaigns will exclude this customer on that channel.'
    });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.post('/campaigns/preview', async (req, res) => {
  const channels = channelSelection(req.body?.channels);
  if (!channels.length) return res.status(400).json({ error: 'Select SMS and/or WhatsApp.' });
  try {
    const rows = await findEligible(channels);
    const byChannel = { sms: 0, whatsapp: 0 };
    rows.forEach(row => { byChannel[row.channel]++; });
    res.json({
      eligibleDeliveries: rows.length,
      uniqueCustomers: new Set(rows.map(row => String(row.customer._id))).size,
      byChannel,
      configuredProviders: { sms: isChannelConfigured('sms'), whatsapp: isChannelConfigured('whatsapp') },
      note: 'A customer opted in to both selected channels may receive a message on both channels. Imported contacts are excluded until channel consent is recorded.'
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/campaigns', async (req, res) => {
  try {
    const campaigns = await MarketingCampaign.find().sort({ createdAt: -1 }).limit(100).lean();
    res.json(campaigns.map(c => ({ id: String(c._id), title: c.title, message: c.message, channels: c.channels, status: c.status, recipientCount: c.recipientCount, createdAt: c.createdAt, queuedAt: c.queuedAt, completedAt: c.completedAt })));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/campaigns', async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const message = String(req.body?.message || '').trim();
  const channels = channelSelection(req.body?.channels);
  if (!title || title.length > 120) return res.status(400).json({ error: 'Campaign title is required (max 120 characters).' });
  if (!message || message.length > 1024) return res.status(400).json({ error: 'Message is required (max 1,024 characters). Check SMS segment limits with your provider.' });
  if (!channels.length) return res.status(400).json({ error: 'Select SMS and/or WhatsApp.' });
  try {
    const eligible = await findEligible(channels);
    if (!eligible.length) return res.status(400).json({ error: 'No customers have active consent for the selected channel(s).' });
    const campaign = await MarketingCampaign.create({ title, message, channels, status: 'draft', recipientCount: eligible.length });
    const recipients = eligible.map(({ customer, channel }) => ({
      campaignId: campaign._id, customerId: customer._id, phone: customer.phone,
      channel, status: 'draft'
    }));
    await MarketingCampaignRecipient.insertMany(recipients, { ordered: false });
    res.status(201).json({
      id: String(campaign._id), title: campaign.title, channels: campaign.channels,
      recipientCount: recipients.length, status: campaign.status,
      message: 'Draft campaign created. No messages have been sent.'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/campaigns/:id/queue', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid campaign id.' });
  try {
    const campaign = await MarketingCampaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
    if (campaign.status !== 'draft') return res.status(409).json({ error: 'Only draft campaigns can be queued.' });
    const missing = campaign.channels.filter(channel => !isChannelConfigured(channel));
    if (missing.length) {
      return res.status(503).json({
        error: 'Campaign was not queued. Configure provider credentials on the backend for: ' + missing.join(', ') + '. No messages have been sent.'
      });
    }
    const result = await MarketingCampaignRecipient.updateMany(
      { campaignId: campaign._id, status: 'draft' }, { $set: { status: 'queued', error: '' } }
    );
    campaign.status = 'queued';
    campaign.queuedAt = new Date();
    await campaign.save();
    res.json({ id: String(campaign._id), status: campaign.status, queued: result.modifiedCount, message: 'Campaign queued. The backend worker will deliver to consented recipients in controlled batches.' });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.get('/campaigns/:id/recipients', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid campaign id.' });
  try {
    const rows = await MarketingCampaignRecipient.find({ campaignId: req.params.id }).sort({ createdAt: 1 }).limit(5000).lean();
    res.json(rows.map(r => ({
      id: String(r._id), phone: r.phone, channel: r.channel, status: r.status,
      providerMessageId: r.providerMessageId || '', error: r.error || '', attempts: r.attempts || 0,
      sentAt: r.sentAt || null, deliveredAt: r.deliveredAt || null
    })));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

export default router;
