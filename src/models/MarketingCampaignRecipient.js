import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'MarketingCampaign', required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'MarketingCustomer', required: true, index: true },
  phone: { type: String, required: true },
  channel: { type: String, enum: ['sms', 'whatsapp'], required: true },
  status: {
    type: String,
    enum: ['draft', 'queued', 'sending', 'accepted', 'delivered', 'failed', 'skipped'],
    default: 'draft',
    index: true
  },
  providerMessageId: { type: String, default: '' },
  error: { type: String, default: '', maxlength: 500 },
  attempts: { type: Number, default: 0 },
  sentAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null }
}, { timestamps: true });

schema.index({ campaignId: 1, customerId: 1, channel: 1 }, { unique: true });
schema.index({ status: 1, createdAt: 1 });
export default mongoose.models.MarketingCampaignRecipient || mongoose.model('MarketingCampaignRecipient', schema);
