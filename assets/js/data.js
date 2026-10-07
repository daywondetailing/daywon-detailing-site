/* Services shown on the site, cheapest first (owner rule: always list them by price). Edit here; the pages update automatically. */
window.SITE_DATA = {
  services: [
    {
      id: "exterior-only",
      startingAt: 25, // starting price; the final quote depends on vehicle size and condition
      name: "Exterior Only Detail",
      duration: "30 min",
      summary: "A complete exterior wash for daily-driven vehicles, without the interior work.",
      interior: [],
      exterior: [
        "Pre-wash to safely loosen dirt and road grime",
        "Contact hand wash",
        "Tires, rims, and wheel faces cleaned and scrubbed"
      ],
      bestFor: [],
      note: "",
      importantNote: "",
      addOnIds: ["spray-wax", "tire-shine"],
      bookingUrls: {}
    },
    {
      id: "interior-only",
      startingAt: 50, // starting price; the final quote depends on vehicle size and condition
      name: "Interior Only Detail",
      duration: "30 min",
      summary: "A thorough interior clean for daily-driven vehicles, without the exterior wash.",
      interior: [
        "Thorough vacuum of carpets, mats, seats, trunk/cargo area, and accessible areas",
        "Tornador blowout of carpets, seat seams, vents, cracks, crevices, and accessible hard-to-reach areas",
        "Interior wipe-down of accessible dashboard, center console, door panels, cup holders, trim, and other reachable surfaces",
        "Steam cleaning of applicable interior surfaces",
        "Carpet and seat spot treatment for light stains and affected areas",
        "Interior windows and screens cleaned",
        "Detailed cleaning around accessible seat rails, door pockets, and crevices"
      ],
      exterior: [],
      bestFor: [],
      note: "",
      importantNote: "",
      addOnIds: ["carpet-extraction", "seat-extraction", "carpet-seat-extraction"],
      bookingUrls: {}
    },
    {
      id: "express-refresh",
      startingAt: 75, // starting price; the final quote depends on vehicle size and condition
      name: "Express Refresh",
      duration: "1 hr",
      summary: "A quick interior and exterior maintenance clean for vehicles that are lightly dirty and regularly maintained. This package is best for customers who want their car looking clean, refreshed, and protected without needing deep extraction or heavy stain removal.",
      interior: [
        "Vacuum of carpets, floor mats, seats, trunk/cargo area, and accessible crevices",
        "Tornador blowout to remove loose dust and debris from carpets, cracks, and hard-to-reach areas",
        "Light interior wipe-down of accessible surfaces",
        "Interior windows and screens cleaned"
      ],
      exterior: [
        "Contact hand wash",
        "Tires and rims cleaned"
      ],
      bestFor: [
        "Light dust, light dirt, and normal weekly or biweekly buildup",
        "Vehicles that have been detailed before or are maintained regularly",
        "Customers who want a clean exterior and a refreshed interior"
      ],
      note: "",
      importantNote: "",
      addOnIds: ["spray-wax", "tire-shine", "carpet-extraction", "seat-extraction", "carpet-seat-extraction"],
      bookingUrls: { square: "https://book.squareup.com/appointments/oxnwtlyrbt4e47/location/LN3M0ZGQN4ND0/services/6MYAICQPZB6TJ42JAJ2P4KN7" }
    },
    {
      id: "full-interior-exterior",
      startingAt: 150, // starting price; the final quote depends on vehicle size and condition
      name: "Full Interior + Exterior Detail",
      duration: "2 hr",
      summary: "A more thorough reset for daily-driven vehicles that need deeper cleaning inside and a complete exterior wash and protection service. This package is ideal for normal daily buildup, light stains, dust in cracks and crevices, and interiors that need more than a simple vacuum and wipe-down.",
      interior: [
        "Thorough vacuum of carpets, mats, seats, trunk/cargo area, and accessible areas",
        "Tornador blowout of carpets, seat seams, vents, cracks, crevices, and accessible hard-to-reach areas",
        "Interior wipe-down of accessible dashboard, center console, door panels, cup holders, trim, and other reachable surfaces",
        "Steam cleaning of applicable interior surfaces",
        "Carpet and seat spot treatment for light stains and affected areas",
        "Interior windows and screens cleaned",
        "Detailed cleaning around accessible seat rails, door pockets, and crevices"
      ],
      exterior: [
        "Pre-wash to safely loosen dirt and road grime",
        "Contact hand wash",
        "Tires, rims, and wheel faces cleaned and scrubbed"
      ],
      bestFor: [
        "Normal daily-driver dirt and buildup",
        "Light stains and light spills",
        "Dust in vents, seams, and tight interior areas",
        "Customers who want a more complete interior and exterior clean"
      ],
      note: "Does not include wax or tire shine (available as add-ons).",
      importantNote: "",
      addOnIds: ["spray-wax", "tire-shine", "carpet-extraction", "seat-extraction", "carpet-seat-extraction"],
      bookingUrls: { square: "https://book.squareup.com/appointments/oxnwtlyrbt4e47/location/LN3M0ZGQN4ND0/services/Y2CIFUMNE6AHYSQ6YEBHNVLS" }
    },
    {
      id: "deep-restoration",
      startingAt: 250, // starting price; the final quote depends on vehicle size and condition
      name: "Deep Restoration Detail",
      duration: "3 hr",
      summary: "Our most thorough package for vehicles with heavy dirt, stains, embedded debris, neglected carpets or seats, and interiors needing a serious reset. This package combines intensive vacuuming, Tornador blowout, steam cleaning, carpet treatment, and extraction to give your vehicle the deepest clean we offer.",
      interior: [
        "Intensive vacuum of carpets, floor mats, seats, trunk/cargo area, and accessible crevices",
        "Detailed Tornador blowout to push dust, sand, and embedded debris out of carpet fibers, seat seams, cracks, and crevices",
        "Thorough wipe-down of accessible dash, door panels, center console, cup holders, trim, and interior touch points",
        "Steam cleaning of applicable interior surfaces",
        "Carpet bomber treatment",
        "Carpet extraction",
        "Cloth-seat extraction when applicable and safe for the material",
        "Spot treatment for stains when possible",
        "Deep cleaning of accessible seat rails, door pockets, cup holders, and crevices",
        "Interior windows and screens cleaned"
      ],
      exterior: [
        "Pre-wash",
        "Contact hand wash",
        "Pressure wash and scrub of tires and rims",
        "Tire shine applied",
        "Spray wax applied for gloss and short-term protection"
      ],
      bestFor: [
        "Embedded dirt, sand, dust, and debris",
        "Dirty carpets or cloth seats",
        "Light-to-moderate stains and spills",
        "Vehicles that have not been cleaned in a long time",
        "Customers wanting the deepest interior clean available"
      ],
      note: "",
      importantNote: "Extraction can leave carpets and cloth seats slightly damp after the appointment. Drying time depends on temperature, humidity, vehicle ventilation, and the amount of extraction needed.",
      addOnIds: [],
      bookingUrls: { square: "https://book.squareup.com/appointments/oxnwtlyrbt4e47/location/LN3M0ZGQN4ND0/services/TSTQXNCIOXL6IAHGNDIU42ZL" }
    }
  ],
  /* Compare chart on the home page. Per package: true = included, "addon" = available as an add-on,
     a string = included with that note, missing = not included. Columns follow `services` order. */
  compare: [
    { group: "Interior" },
    { label: "Vacuum of carpets, mats, seats and trunk", "express-refresh": true, "full-interior-exterior": "Thorough", "deep-restoration": "Intensive", "interior-only": "Thorough" },
    { label: "Tornador blowout of dust and debris", "express-refresh": true, "full-interior-exterior": true, "deep-restoration": "Detailed", "interior-only": true },
    { label: "Interior wipe-down", "express-refresh": "Light", "full-interior-exterior": true, "deep-restoration": "Thorough", "interior-only": true },
    { label: "Interior windows and screens", "express-refresh": true, "full-interior-exterior": true, "deep-restoration": true, "interior-only": true },
    { label: "Steam cleaning", "full-interior-exterior": true, "deep-restoration": true, "interior-only": true },
    { label: "Spot treatment for stains", "full-interior-exterior": "Light stains", "deep-restoration": true, "interior-only": "Light stains" },
    { label: "Seat rails, door pockets and crevices", "full-interior-exterior": true, "deep-restoration": "Deep clean", "interior-only": true },
    { label: "Carpet bomber treatment", "deep-restoration": true },
    { label: "Carpet extraction", "express-refresh": "addon", "full-interior-exterior": "addon", "deep-restoration": true, "interior-only": "addon", addOn: "carpet-extraction" },
    { label: "Cloth seat extraction", "express-refresh": "addon", "full-interior-exterior": "addon", "deep-restoration": true, "interior-only": "addon", addOn: "seat-extraction" },
    { group: "Exterior" },
    { label: "Contact hand wash", "express-refresh": true, "full-interior-exterior": true, "deep-restoration": true, "exterior-only": true },
    { label: "Pre-wash to loosen dirt and grime", "full-interior-exterior": true, "deep-restoration": true, "exterior-only": true },
    { label: "Tires and rims cleaned", "express-refresh": true, "full-interior-exterior": "Scrubbed", "deep-restoration": "Pressure washed", "exterior-only": "Scrubbed" },
    { label: "Tire shine", "express-refresh": "addon", "full-interior-exterior": "addon", "deep-restoration": true, "exterior-only": "addon", addOn: "tire-shine" },
    { label: "Spray wax", "express-refresh": "addon", "full-interior-exterior": "addon", "deep-restoration": true, "exterior-only": "addon", addOn: "spray-wax" }
  ],
  addOns: [
    { id: "spray-wax", name: "Spray wax", price: 20, extraTime: null, area: "exterior" },
    { id: "tire-shine", name: "Tire shine", price: 10, extraTime: null, area: "exterior" },
    { id: "carpet-extraction", name: "Carpet extraction", price: 25, extraTime: "15 min", area: "interior" },
    { id: "seat-extraction", name: "Seat extraction", price: 20, extraTime: "15 min", area: "interior" },
    { id: "carpet-seat-extraction", name: "Carpet + Seat Extraction", price: 40, extraTime: "35 min", area: "interior" }
  ]
};
