
(() => {
  if (window.IBSConsent) return;

  const STORAGE_KEY = "ibs_consent_preferences";

  // --------------------------------------------------
  // 1. Initialize Google Consent Mode defaults FIRST
  // --------------------------------------------------

  window.dataLayer = window.dataLayer || [];

  window.gtag = window.gtag || function () {
    window.dataLayer.push(arguments);
  };

  window.gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied"
  });

  // --------------------------------------------------
  // 2. Detect GPC
  // --------------------------------------------------

  const query = new URLSearchParams(window.location.search);

  // Temporary testing option. Remove before production.
  const gpcTestMode =
    query.get("ibs_gpc_test") === "1";

  const gpcDetected =
    navigator.globalPrivacyControl === true || gpcTestMode;

  console.log("IBS GPC detected:", gpcDetected);

  // --------------------------------------------------
  // 3. Read saved visitor preferences
  // --------------------------------------------------

function readConsent() {
  try {
    // First, look for the new consent cookie.
    const cookie = document.cookie
      .split("; ")
      .find((item) => item.startsWith(`${STORAGE_KEY}=`));

    if (cookie) {
      const value = cookie.substring(STORAGE_KEY.length + 1);
      const parsed = JSON.parse(decodeURIComponent(value));

      return {
        necessary: true,
        analytics: Boolean(parsed.analytics),
        advertising: Boolean(parsed.advertising)
      };
    }

    // Migration: preserve existing localStorage consent
    // from visitors who used an older version of IBS.
    const legacy = localStorage.getItem(STORAGE_KEY);

    if (legacy) {
      const parsed = JSON.parse(legacy);
      const migrated = saveConsent(parsed);

      localStorage.removeItem(STORAGE_KEY);

      return migrated;
    }

    return null;
  } catch (error) {
    console.warn("IBS: Unable to read consent:", error);
    return null;
  }
}

function saveConsent(value) {
  const saved = {
    necessary: true,
    analytics: Boolean(value.analytics),
    advertising: Boolean(value.advertising)
  };

  const cookieValue = encodeURIComponent(JSON.stringify(saved));

  const secure =
    window.location.protocol === "https:" ? "; Secure" : "";

  document.cookie =
    `${STORAGE_KEY}=${cookieValue}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;

  return saved;
}


  let consent = readConsent() || {
    necessary: true,
    analytics: false,
    advertising: false
  };

  // GPC overrides previously saved optional consent.
  if (gpcDetected) {
    consent = saveConsent({
      analytics: false,
      advertising: false
    });
  }

  // --------------------------------------------------
  // 4. Map preferences to Google Consent Mode v2
  // --------------------------------------------------

  function enforceGPC(value) {
    if (gpcDetected) {
      return {
        analytics: false,
        advertising: false
      };
    }

    return {
      analytics: Boolean(value.analytics),
      advertising: Boolean(value.advertising)
    };
  }

  function getGoogleConsent(value) {
    return {
      analytics_storage:
        value.analytics ? "granted" : "denied",

      ad_storage:
        value.advertising ? "granted" : "denied",

      ad_user_data:
        value.advertising ? "granted" : "denied",

      ad_personalization:
        value.advertising ? "granted" : "denied"
    };
  }

  consent = enforceGPC(consent);

  // --------------------------------------------------
  // 5. GTM configuration and loading
  // --------------------------------------------------

  let merchantSettings = null;
  let gtmLoaded = false;

  function loadGTM(containerId) {
    if (gtmLoaded || window.__ibsGtmLoaded) {
      return;
    }

    if (!/^GTM-[A-Z0-9]+$/.test(containerId)) {
      console.error("IBS: Invalid GTM Container ID.");
      return;
    }

    gtmLoaded = true;
    window.__ibsGtmLoaded = true;

    window.dataLayer.push({
      "gtm.start": Date.now(),
      event: "gtm.js"
    });

    const script = document.createElement("script");

    script.async = true;

    script.src =
      "https://www.googletagmanager.com/gtm.js?id=" +
      encodeURIComponent(containerId);

    document.head.appendChild(script);

    console.log("IBS: GTM loading:", containerId);
  }

  
function maybeLoadGTM() {
  if (!merchantSettings) return;

  if (!merchantSettings.enabled) {
    console.log("IBS: Consent Manager is disabled.");
    return;
  }

  // Preserve the existing GPC restriction.
  // GPC must continue to block GTM.
  if (gpcDetected) {
    console.log("IBS: GPC detected. GTM loading blocked.");
    return;
  }

  const containerId = merchantSettings.gtmContainerId;

  if (!containerId) {
    console.warn("IBS: GTM Container ID is not configured.");
    return;
  }

  const mode = String(
    merchantSettings.consentMode || "STRICT"
  ).toUpperCase();

  const hasOptionalConsent =
    consent.analytics || consent.advertising;

  // Determine whether this visitor is inside
  // the merchant's selected consent scope.
  const consentRulesApply =
    scopeStatus.consentRulesApply;

  console.log("IBS GTM scope decision:", {
    mode,
    consentRulesApply,
    hasOptionalConsent,
    visitorCountry: scopeStatus.visitorCountry,
    visitorRegion: scopeStatus.visitorRegion
  });

  if (mode === "STRICT") {

    // Inside scope: wait for visitor consent.
    if (consentRulesApply) {
      if (!hasOptionalConsent) {
        console.log(
          "IBS: Inside consent scope. Waiting for consent."
        );
        return;
      }

      loadGTM(containerId);
      return;
    }

    // Outside scope: load GTM without waiting
    // for a consent choice. Consent defaults remain denied.
    console.log(
      "IBS: Outside consent scope. Loading GTM with denied defaults."
    );

    loadGTM(containerId);
    return;
  }

  if (mode === "SOFT") {
    // Soft mode loads GTM with Consent Mode defaults.
    loadGTM(containerId);
    return;
  }

  console.warn("IBS: Unknown consent mode:", mode);
}


  // --------------------------------------------------
  // 6. Update Google consent and GTM loading
  // --------------------------------------------------

  function updateGoogleConsent(value) {
    consent = enforceGPC(value);

    window.gtag(
      "consent",
      "update",
      getGoogleConsent(consent)
    );

    maybeLoadGTM();

    return { ...consent };
  }

  // --------------------------------------------------
  // 7. Geolocation and consent scope calculation
  // --------------------------------------------------

  let geoLocation = null;
  let scopeStatus = {
    merchantScope: "WORLDWIDE",
    visitorCountry: null,
    visitorRegion: null,
    locationKnown: false,
    consentRulesApply: true,
    reason: "Location not yet determined"
  };

  function calculateConsentScope(settings) {
    const merchantScope = String(
      settings.consentScope || "WORLDWIDE"
    ).toUpperCase();

    const countryCode = String(
      geoLocation?.countryCode || ""
    ).trim().toUpperCase();

    const regionCode = String(
      geoLocation?.regionCode || ""
    ).trim().toUpperCase();

    const regionName = String(
      geoLocation?.regionName || ""
    ).trim().toUpperCase();

    const locationKnown = Boolean(countryCode);

    let consentRulesApply = true;
    let reason = "Location unavailable; applying rules conservatively";

    if (!locationKnown) {
      // Do not assume a visitor is outside scope
      // when location detection has failed.
      consentRulesApply = true;
    } else if (merchantScope === "CALIFORNIA") {
      if (countryCode !== "US") {
        consentRulesApply = false;
        reason = "Visitor is outside the United States";
      } else if (
        regionCode === "CA" ||
        regionName === "CALIFORNIA"
      ) {
        consentRulesApply = true;
        reason = "Visitor is in California";
      } else if (!regionCode && !regionName) {
        // State is unknown. Apply rules conservatively.
        consentRulesApply = true;
        reason = "US visitor state unavailable";
      } else {
        consentRulesApply = false;
        reason = "Visitor is outside California";
      }
    } else if (merchantScope === "US") {
      consentRulesApply = countryCode === "US";
      reason = consentRulesApply
        ? "Visitor is in the United States"
        : "Visitor is outside the United States";
    } else if (merchantScope === "WORLDWIDE") {
      consentRulesApply = true;
      reason = "Worldwide scope applies to all visitors";
    } else {
      // Unknown merchant setting: use conservative behaviour.
      consentRulesApply = true;
      reason = "Unknown merchant scope; applying rules conservatively";
    }

    scopeStatus = {
      merchantScope,
      visitorCountry: countryCode || null,
      visitorRegion: regionCode || regionName || null,
      locationKnown,
      consentRulesApply,
      reason
    };

    console.log("IBS consent scope result:", scopeStatus);

    return { ...scopeStatus };
  }

  // --------------------------------------------------
  // 8. Expose the public IBS API
  // --------------------------------------------------

  let resolveInitialization;

  const initializationReady = new Promise((resolve) => {
    resolveInitialization = resolve;
  });

  window.IBSConsent = {
    update: updateGoogleConsent,

    getConsent: () => ({ ...consent }),

    gpcDetected,

    ready: initializationReady,

    getGeoLocation: () => (
      geoLocation ? { ...geoLocation } : null
    ),

    getScopeStatus: () => ({ ...scopeStatus })
  };

  // Apply existing preferences on page load.
  updateGoogleConsent(consent);

  // --------------------------------------------------
  // 9. Retrieve settings and geolocation from App Proxy
  // --------------------------------------------------

  fetch("/apps/ibs-consent-config", {
    credentials: "same-origin",
    cache: "no-store"
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          "Unable to retrieve consent settings."
        );
      }

      return response.json();
    })
    .then((settings) => {
      merchantSettings = settings;

      // Read the geolocation returned by the backend.
      geoLocation = settings.geoLocation || null;

      // Calculate whether the selected geographic
      // consent rules apply to this visitor.
      calculateConsentScope(settings);

      console.log("IBS settings loaded:", {
        enabled: settings.enabled,
        consentMode: settings.consentMode,
        consentScope: settings.consentScope,
        gtmConfigured: Boolean(settings.gtmContainerId)
      });

      console.log("IBS visitor location:", geoLocation);

      // Existing GTM behaviour remains unchanged.
      maybeLoadGTM();

      // Tell other storefront scripts that
      // settings and geolocation are ready.
      resolveInitialization();
    })
    .catch((error) => {
      console.error("IBS configuration error:", error);

      // Keep conservative scope behaviour if the
      // settings or location request fails.
      geoLocation = null;

      scopeStatus = {
        merchantScope: "WORLDWIDE",
        visitorCountry: null,
        visitorRegion: null,
        locationKnown: false,
        consentRulesApply: true,
        reason: "Configuration or location request failed"
      };

      resolveInitialization();
    });

  console.log("IBS: Consent initialization completed.");
})();
