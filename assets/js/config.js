/* Daywon Detailing site settings. Edit the values, keep the quotes. */
window.SITE_CONFIG = {
  booking: {
    // "quote" = our own quote-request form.  "square" = send customers to Square.
    // To add another system later: add an entry under `external` and set mode to its key.
    mode: "quote",
    external: {
      square: {
        label: "Book on Square",
        url: "https://book.squareup.com/appointments/oxnwtlyrbt4e47/location/LN3M0ZGQN4ND0/services"
      }
    }
  },
  form: {
    endpoint: "https://api.web3forms.com/submit",
    accessKey: "YOUR_WEB3FORMS_ACCESS_KEY", // PLACEHOLDER: get a free key at web3forms.com for daywondetailing@gmail.com
    subjectPrefix: "New quote request"
  },
  portal: {
    enabled: true,                                   // false = old Web3Forms/mailto behavior only
    supabaseUrl: "https://ygmgkizklnsouskgyxvw.supabase.co",
    supabaseKey: "sb_publishable_DJW9Hf3W6AmYZsWjGGkBEg_7pBK4b4_", // PUBLISHABLE key only. Never a secret/service key.
    timeoutMs: 10000
  },
  /* Hours we work. Keys are weekdays: 0 = Sunday ... 6 = Saturday. [start hour, end hour] in 24h time.
     Leave a day out to mark it closed. Customers pick a 30-minute arrival window inside these hours. */
  schedule: {
    slotMinutes: 30,
    daysAhead: 60,
    hours: {
      0: [11, 17], // Sunday 11 AM to 5 PM
      1: [11, 17], // Monday
      2: [11, 17], // Tuesday
      3: [14, 17], // Wednesday 2 PM to 5 PM
      4: [11, 17], // Thursday
      5: [14, 17], // Friday 2 PM to 5 PM
      6: [11, 17]  // Saturday
    }
  },
  contact: {
    phoneDisplay: "240-579-5092",
    phoneE164: "+12405795092",
    email: "daywondetailing@gmail.com",
    instagram: "daywondetailing",
    tiktok: "daywon.detailing",
    facebook: "" // PLACEHOLDER: add the Facebook page URL when it exists
  },
  serviceArea: { center: "Silver Spring, MD", radiusMiles: 15 }
};
