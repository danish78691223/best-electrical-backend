import MarketingCustomer from '../models/MarketingCustomer.js';
import MarketingCampaign from '../models/MarketingCampaign.js';
import MarketingCampaignRecipient from '../models/MarketingCampaignRecipient.js';
import { mongoReady } from '../config/db.js';
import { sendSms, sendWhatsAppTemplate } from './marketingProviders.js';

let timer = null;
let busy = false;

async function sendOne(recipient, campaign) {
  const customer = await MarketingCustomer.findById(recipient.customerId).lean();
  if (!customer || customer.doNotContact ||
      (recipient.channel === 'sms' && !customer.smsConsent) ||
      (recipient.channel === 'whatsapp' && !customer.whatsappConsent)) {
    await MarketingCampaignRecipient.updateOne({ _id: recipient._id }, {
      $set: { status: 'skipped', error: 'Consent was removed or customer suppressed before send.' }
    });
    return;
  }

  try {
    const result = recipient.channel === 'sms'
      ? await sendSms({ to: recipient.phone, message: campaign.message })
      : await sendWhatsAppTemplate({ to: recipient.phone, message: campaign.message });
    await MarketingCampaignRecipient.updateOne({ _id: recipient._id }, {
      $set: {
        status: 'accepted',
        providerMessageId: result.providerMessageId || '',
        error: '',
        sentAt: new Date()
      }
    });
  } catch (error) {
    await MarketingCampaignRecipient.updateOne({ _id: recipient._id }, {
      $set: { status: 'failed', error: String(error.message || 'Provider send failed').slice(0, 500) },
      $inc: { attempts: 1 }
    });
  }
}

async function updateCampaignStatuses() {
  const campaigns = await MarketingCampaign.find({ status: { $in: ['queued', 'sending'] } }).select('_id').limit(100).lean();
  for (const campaign of campaigns) {
    const counts = await MarketingCampaignRecipient.aggregate([
      { $match: { campaignId: campaign._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const summary = Object.fromEntries(counts.map(x => [x._id, x.count]));
    const pending = (summary.queued || 0) + (summary.sending || 0);
    if (pending === 0) {
      const failed = (summary.failed || 0) + (summary.skipped || 0);
      const completed = (summary.accepted || 0) + (summary.delivered || 0);
      const status = failed && completed ? 'partial' : failed ? 'failed' : 'completed';
      await MarketingCampaign.updateOne({ _id: campaign._id }, { $set: { status, completedAt: new Date() } });
    } else {
      await MarketingCampaign.updateOne({ _id: campaign._id, status: 'queued' }, { $set: { status: 'sending' } });
    }
  }
}

async function tick() {
  if (busy || !mongoReady()) return;
  busy = true;
  try {
    // Small bounded batches avoid firing a large burst at either provider.
    for (let i = 0; i < 3; i++) {
      const recipient = await MarketingCampaignRecipient.findOneAndUpdate(
        { status: 'queued' },
        { $set: { status: 'sending', error: '' }, $inc: { attempts: 1 } },
        { new: true, sort: { createdAt: 1 } }
      );
      if (!recipient) break;
      const campaign = await MarketingCampaign.findById(recipient.campaignId).lean();
      if (!campaign || campaign.status === 'failed') {
        await MarketingCampaignRecipient.updateOne({ _id: recipient._id }, { $set: { status: 'skipped', error: 'Campaign is unavailable.' } });
        continue;
      }
      await sendOne(recipient, campaign);
    }
    await updateCampaignStatuses();
  } catch (error) {
    console.error('Marketing worker error:', error.message);
  } finally {
    busy = false;
  }
}

export function startMarketingWorker() {
  if (timer) return;
  // Persisted queue records survive a server restart; each process handles a small batch.
  timer = setInterval(() => { tick().catch(error => console.error('Marketing worker error:', error.message)); }, 1500);
  timer.unref?.();
}
