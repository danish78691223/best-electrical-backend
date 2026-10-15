import mongoose from 'mongoose';

const consentEventSchema = new mongoose.Schema({
  channel: { type: String, enum: ['sms', 'whatsapp'], required: true },
  granted: { type: Boolean, required: true },
  source: { type: String, required: true, maxlength: 240 },
  recordedAt: { type: Date, default: Date.now }
}, { _id: false });

const schema = new mongoose.Schema({
  name: { type: String, default: '', trim: true, maxlength: 120 },
  phone: { type: String, required: true, unique: true, index: true, trim: true },
  source: { type: String, default: 'address-book-import', maxlength: 80 },
  smsConsent: { type: Boolean, default: false },
  whatsappConsent: { type: Boolean, default: false },
  smsConsentAt: { type: Date, default: null },
  whatsappConsentAt: { type: Date, default: null },
  smsConsentSource: { type: String, default: '' },
  whatsappConsentSource: { type: String, default: '' },
  doNotContact: { type: Boolean, default: false },
  lastSyncedAt: { type: Date, default: Date.now },
  consentHistory: { type: [consentEventSchema], default: [] }
}, { timestamps: true });

export default mongoose.models.MarketingCustomer || mongoose.model('MarketingCustomer', schema);
