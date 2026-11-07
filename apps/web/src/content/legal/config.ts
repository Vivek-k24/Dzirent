// apps/web/src/content/legal/config.ts
// Configuration holding every legal fill-in from pranalika/legal-placeholders.md.
// Any unknown value is kept empty so it visibly renders as a highlighted "[To be completed: <what>]" marker.

export interface LegalConfig {
  // Flag indicating legal draft status
  legalDraft: boolean;

  // 1. Company and contact
  COMPANY_LEGAL_NAME: string;
  COMPANY_ENTITY_TYPE: string;
  COMPANY_STATE_OF_FORMATION: string;
  BRAND_NAME: string;
  REGISTERED_ADDRESS: string;
  CONTACT_EMAIL: string;
  SUPPORT_EMAIL: string;
  PRIVACY_EMAIL: string;
  SECURITY_EMAIL: string;
  SUPPORT_RESPONSE_TIME: string;

  // 2. Dates and versions
  EFFECTIVE_DATE_TERMS: string;
  EFFECTIVE_DATE_PRIVACY: string;
  EFFECTIVE_DATE_RULES: string;
  EFFECTIVE_DATE_COPYRIGHT: string;
  TERMS_VERSION: string;
  PRIVACY_VERSION: string;
  CHANGE_NOTICE: string;

  // 3. Law, disputes and marketplace role
  GOVERNING_LAW_STATE: string;
  VENUE: string;
  DISPUTE_PROCESS: string;
  LIABILITY_CAP: string;
  MARKETPLACE_ROLE: string;
  DAMAGE_AND_LOSS: string;
  DEPOSIT_RECOMMENDATION: string;
  SERVICE_AREA: string;

  // 4. Age
  MINIMUM_AGE: string;
  AGE_REQUIREMENT_WORDING: string;
  MINOR_ACCOUNT_PROCESS: string;

  // 5. Taxes
  LENDER_TAX_STATEMENT: string;
  SALES_TAX_STATEMENT: string;

  // 6. Privacy policy details
  DATA_RETENTION: string;
  PRIVACY_REQUEST_PROCESS: string;
  APPEAL_PROCESS: string;
  SALE_AND_ADS_STATEMENT: string;
  LOCATION_STATEMENT: string;
  CONSUMER_HEALTH_DATA: string;
  SENSITIVE_DATA_REVIEW: string;
  BIOMETRIC_STATEMENT: string;
  WHAT_STAYS_AFTER_DELETION: string;
  DELETE_ACCOUNT_URL: string;

  // 7. Copyright and DMCA
  DMCA_AGENT_NAME: string;
  DMCA_AGENT_ADDRESS: string;
  DMCA_AGENT_EMAIL: string;
  DMCA_AGENT_PHONE: string;
  DMCA_DESIGNATION_NUMBER: string;
  REPEAT_INFRINGER_RULE: string;
  COUNTER_NOTICE_PROCESS: string;

  // 8. Community rules, prohibited items and safety
  PROHIBITED_ITEMS: string;
  COMMUNITY_RULES: string;
  REPORT_HANDLING: string;
  SAFETY_TIPS: string;

  // 9. Later phases (P6A, P6B, P6C, P8A, P8B, P4A)
  ID_VERIFICATION_PROVIDER: string;
  ID_DATA_RETENTION: string;
  PAYMENT_PROVIDER: string;
  PAYMENT_PROVIDER_TERMS_URL: string;
  FEES: string;
  REFUND_POLICY: string;
  DEPOSIT_RULES: string;
  CANCELLATION_POLICY: string;
  EMAIL_SENDER_NAME: string;
  EMAIL_FROM_ADDRESS: string;
  EMAIL_FOOTER_ADDRESS: string;
  STORE_DEVELOPER_NAME: string;
  PRIVACY_POLICY_URL: string;
  TERMS_URL: string;
  SUPPORT_URL: string;
  ACCESSIBILITY_CONTACT: string;
}

export const LEGAL_CONFIG: LegalConfig = {
  // When true, every legal page shows: "Draft. These terms are being finalized."
  legalDraft: true,

  // 1. Company and contact
  COMPANY_LEGAL_NAME: "", // To be filled by Owner
  COMPANY_ENTITY_TYPE: "", // To be filled by Owner (e.g. limited liability company)
  COMPANY_STATE_OF_FORMATION: "", // To be filled by Owner
  BRAND_NAME: "Dzirent",
  REGISTERED_ADDRESS: "", // To be filled by Owner (postal address for legal notices)
  CONTACT_EMAIL: "", // To be filled by Owner
  SUPPORT_EMAIL: "support@dzirent.com",
  PRIVACY_EMAIL: "", // To be filled by Owner
  SECURITY_EMAIL: "", // To be filled by Owner
  SUPPORT_RESPONSE_TIME: "", // To be filled by Owner (e.g. within 2 business days)

  // 2. Dates and versions
  EFFECTIVE_DATE_TERMS: "", // To be filled by Owner + attorney
  EFFECTIVE_DATE_PRIVACY: "", // To be filled by Owner + attorney
  EFFECTIVE_DATE_RULES: "", // To be filled by Owner + attorney
  EFFECTIVE_DATE_COPYRIGHT: "", // To be filled by Owner + attorney
  TERMS_VERSION: "1.0.0",
  PRIVACY_VERSION: "1.0.0",
  CHANGE_NOTICE: "", // To be filled by Attorney (how users are notified and notice period)

  // 3. Law, disputes and marketplace role
  GOVERNING_LAW_STATE: "", // To be filled by Attorney
  VENUE: "", // To be filled by Attorney
  DISPUTE_PROCESS: "", // To be filled by Attorney (informal resolution, arbitration, small claims)
  LIABILITY_CAP: "", // To be filled by Attorney
  MARKETPLACE_ROLE:
    "Dzirent provides a peer-to-peer platform connecting lenders and renters. Dzirent is not a party to any rental agreements, takes no rental payments or commissions today, and does not hold or ship garments.",
  DAMAGE_AND_LOSS:
    "Renters and lenders settle any damage, loss, cleaning, or late returns between themselves while there are no integrated payments on the platform.",
  DEPOSIT_RECOMMENDATION:
    "Lenders are encouraged to ask for a security deposit on high-value pieces, arranged directly between the parties.",
  SERVICE_AREA: "United States (US cities available in the platform city selection)",

  // 4. Age
  MINIMUM_AGE: "18",
  AGE_REQUIREMENT_WORDING: "", // To be filled by Attorney (e.g. 18 years of age or older)
  MINOR_ACCOUNT_PROCESS: "", // To be filled by Owner + attorney (suspension and deletion process)

  // 5. Taxes
  LENDER_TAX_STATEMENT: "", // To be filled by Attorney / tax adviser (lender earnings reporting responsibility)
  SALES_TAX_STATEMENT: "", // To be filled by Attorney / tax adviser (sales tax handling)

  // 6. Privacy policy details
  DATA_RETENTION: "", // To be decided by Owner + attorney
  PRIVACY_REQUEST_PROCESS: "", // To be filled by Attorney (how requests are verified and response timeframe)
  APPEAL_PROCESS: "", // To be filled by Attorney (process and timing for privacy appeals)
  SALE_AND_ADS_STATEMENT:
    "Dzirent does not sell personal data, share personal data for cross-context behavioral advertising, or use third-party tracking scripts.",
  LOCATION_STATEMENT:
    "Device location is rounded to approximately 1 km (2 decimal places) before storage. Coordinates are never shared with other users; only distance in whole miles is shown.",
  CONSUMER_HEALTH_DATA: "", // To be reviewed by Attorney (Washington MHMDA review of body measurements)
  SENSITIVE_DATA_REVIEW: "", // To be reviewed by Attorney (state privacy law review of cultural styles and studio tags)
  BIOMETRIC_STATEMENT:
    "Listing photo checks generate a 768-dimensional numerical image fingerprint used strictly for duplicate image detection. This is a mathematical vector representing garment visual patterns, not a biometric identifier or facial template.",
  WHAT_STAYS_AFTER_DELETION:
    "Account deletion removes your profile, private body measurements, style interests, listings, and photos, and cascades to delete conversation history and rental records for both participants. Signed accessory declarations and listing declarations are retained for legal audit with user identifiers unlinked. System infrastructure logs are retained until their natural expiration.",
  DELETE_ACCOUNT_URL: "https://dzirent.com/delete-account",

  // 7. Copyright and DMCA
  DMCA_AGENT_NAME: "", // To be filled by Owner (must match Copyright Office filing)
  DMCA_AGENT_ADDRESS: "", // To be filled by Owner
  DMCA_AGENT_EMAIL: "", // To be filled by Owner
  DMCA_AGENT_PHONE: "", // To be filled by Owner
  DMCA_DESIGNATION_NUMBER: "", // To be filled by Owner (Copyright Office directory number)
  REPEAT_INFRINGER_RULE: "", // To be filled by Attorney (account termination standard)
  COUNTER_NOTICE_PROCESS: "", // To be filled by Attorney (counter-notice requirements and waiting period)

  // 8. Community rules, prohibited items and safety
  PROHIBITED_ITEMS:
    "Everyday basics (T-shirts, tank tops, hoodies, sweatshirts, track pants, sweatpants, joggers, shorts, plain jeans); lingerie, underwear, and swimwear; shoes, boots, hats, caps, socks, pantyhose, and smartwatches.",
  COMMUNITY_RULES: "", // To be filled by Owner + attorney (behavior standards, suspension, and ban policy)
  REPORT_HANDLING: "", // To be filled by Owner (report review timeframe and process)
  SAFETY_TIPS:
    "Meet in daylight in busy public places, tell a friend where you are going, inspect the piece together before paying, and keep all communications within the app.",

  // 9. Later phases
  ID_VERIFICATION_PROVIDER: "", // P6A (Planned: Didit)
  ID_DATA_RETENTION: "", // P6A
  PAYMENT_PROVIDER: "", // P6B (Planned: Stripe)
  PAYMENT_PROVIDER_TERMS_URL: "", // P6B
  FEES: "", // P6B
  REFUND_POLICY: "", // P6B
  DEPOSIT_RULES: "", // P6B
  CANCELLATION_POLICY: "", // P6B
  EMAIL_SENDER_NAME: "", // P6C
  EMAIL_FROM_ADDRESS: "", // P6C
  EMAIL_FOOTER_ADDRESS: "", // P6C
  STORE_DEVELOPER_NAME: "", // P8A, P8B (Must equal COMPANY_LEGAL_NAME)
  PRIVACY_POLICY_URL: "https://dzirent.com/privacy",
  TERMS_URL: "https://dzirent.com/terms",
  SUPPORT_URL: "https://dzirent.com/support",
  ACCESSIBILITY_CONTACT: "", // P4A
};
