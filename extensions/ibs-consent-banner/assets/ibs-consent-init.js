
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
      return JSON.parse(
        localStorage.getItem(STORAGE_KEY)
      );
    } catch {
      return null;
    }
  }

  function saveConsent(value) {
    const saved = {
      necessary: true,
      analytics: Boolean(value.analytics),
      advertising: Boolean(value.advertising),
      updatedAt: new Date().toISOString()
    };

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(saved)
    );

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

    if (mode === "STRICT") {
      if (!hasOptionalConsent || gpcDetected) {
        console.log("IBS: Strict mode waiting for consent.");
        return;
      }

      loadGTM(containerId);
      return;
    }

    if (mode === "SOFT") {
      // Denied defaults are already established.
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

    window.gtag("consent", "update",
      getGoogleConsent(consent)
    );

    maybeLoadGTM();

    return { ...consent };
  }

  // Expose a small public API for the banner.
  window.IBSConsent = {
    update: updateGoogleConsent,

    getConsent: () => ({ ...consent }),

    gpcDetected
  };

  // Apply existing preferences on page load.
  updateGoogleConsent(consent);

  // --------------------------------------------------
  // 7. Retrieve settings from Shopify App Proxy
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

      console.log("IBS settings loaded:", {
        enabled: settings.enabled,
        consentMode: settings.consentMode,
        gtmConfigured: Boolean(settings.gtmContainerId)
      });

      // Handles saved consent and Soft mode.
      // Also handles a visitor who clicked before
      // the settings request finished.
      maybeLoadGTM();
    })
    .catch((error) => {
      console.error("IBS configuration error:", error);
    });

  console.log("IBS: Consent initialization completed.");
})();
