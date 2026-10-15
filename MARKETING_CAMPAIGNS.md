# BEST ELECTRICAL Marketing Campaigns

This feature runs behind the backend-only `ADMIN_API_KEY`. Configure a random secret with at least 24 characters in the backend host environment; enter it in the admin panel's marketing section. Do not commit the key or put it in a `VITE_*` variable. Contact and campaign endpoints return 503 until the key and MongoDB are configured.

## Contact import and consent

- The admin panel accepts VCF/vCard and CSV files; the owner can export contacts from Android Contacts and upload them. The owner-only companion app can sync contacts directly after Android's system permission.
- Importing a phone number is **not** marketing consent. New records begin with both `smsConsent=false` and `whatsappConsent=false`.
- Record consent separately for each channel and enter how/when consent was obtained. Withdrawn consent removes that channel from future campaign eligibility.
- Only import contacts whose use is consistent with the shop's privacy notice. Restrict access, avoid retaining unnecessary contact data, and honour all opt-outs.

## SMS adapter

The worker expects a backend SMS gateway adapter URL configured with:
- `SMS_API_URL`: provider-compatible JSON endpoint.
- `SMS_API_TOKEN`: bearer token.
- `SMS_SENDER_ID`: registered sender/header expected by the chosen adapter.

The adapter request schema is JSON `{ "to": "+919876543210", "message": "...", "senderId": "..." }`. Most gateways have different request schemas; use a small adapter that maps this contract to your selected provider and verifies its response. Do not turn on campaigns until the provider contract is tested and the business has completed applicable Indian DLT Principal Entity, registered header/content template, and consent requirements.

## WhatsApp Business Platform

Configure:
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_TEMPLATE_NAME`
- `WHATSAPP_TEMPLATE_LANGUAGE` (defaults to `en`)
- `WHATSAPP_GRAPH_API_VERSION` (the Graph API version approved for the Meta app)
- `WHATSAPP_TEMPLATE_BODY_VARIABLE=true`

The chosen approved template must include one body variable `{{1}}`. The campaign text is sent as that variable. This implementation sends approved template messages only. It does not use a personal WhatsApp account or bypass WhatsApp opt-in requirements.

## Queue behaviour

- Campaigns are saved as drafts and explicitly queued by an admin.
- Queue worker delivers in small batches and records provider accepted/failed status.
- `accepted` means the provider accepted the API request; it is not a proof of final device delivery. Configure provider-specific webhooks before treating status as delivered.
- Selecting both channels may send two messages to the same customer if they consented to both.
- Provider secrets remain server-side. Test with a small number of consenting numbers before any large campaign.

## API

All endpoints below are mounted under `/api/admin/marketing` and require `x-admin-key`:
- `GET /contacts`
- `POST /contacts/import` with `{ "contacts": [{ "name": "...", "phone": "...", "source": "..." }] }`
- `PATCH /contacts/:id/consent` with `{ "channel": "sms|whatsapp", "enabled": true|false, "consentSource": "..." }`
- `POST /campaigns/preview`
- `POST /campaigns`
- `GET /campaigns`
- `POST /campaigns/:id/queue`
- `GET /campaigns/:id/recipients`
