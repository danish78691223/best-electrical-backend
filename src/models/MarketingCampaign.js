import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  message: { type: String, required: true, trim: true, maxlength: 1024 },
  channels: { type: [String], enum: ['sms', 'whatsapp'], required: true },
  status: {
    type: String,
    enum: ['draft', 'queued', 'sending', 'completed', 'partial', 'failed'],
    default: 'draft',
    index: true
  },
  recipientCount: { type: Number, default: 0 },
  createdBy: { type: String, default: 'admin' },
  queuedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null }
}, { timestamps: true });

export default mongoose.models.MarketingCampaign || mongoose.model('MarketingCampaign', schema);
