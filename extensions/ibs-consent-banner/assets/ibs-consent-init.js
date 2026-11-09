
(() => {
  if (window.IBSConsent) return;

  const STORAGE_KEY = "ibs_consent_preferences";

  // Set Google's consent defaults immediately.
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

  function readConsent() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  }

  let consent = readConsent() || {
    necessary: true,
    analytics: false,
    advertising: false
  };

  const query = new URLSearchParams(location.search);

  // Temporary test switch. Remove before production.
  const gpcTestMode = query.get("ibs_gpc_test") === "1";

  const gpcDetected =
    navigator.globalPrivacyControl === true || gpcTestMode;

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

  function updateGoogleConsent(value) {
    consent = enforceGPC(value);

    window.gtag(
      "consent",
      "update",
      getGoogleConsent(consent)
    );

    return { ...consent };
  }

  // Make the update function available to the banner.
  window.IBSConsent = {
    update: updateGoogleConsent,
    getConsent: () => ({ ...consent }),
    gpcDetected
  };

  // Apply the saved visitor choice, or denied defaults.
  updateGoogleConsent(consent);

  if (gpcDetected) {
    console.log("IBS: GPC detected. Optional consent denied.");
  }

  // Retrieve merchant settings from the Shopify App Proxy.
  fetch("/apps/ibs-consent-config", {
    credentials: "same-origin",
    cache: "no-store"
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Unable to retrieve consent settings.");
      }

      return response.json();
    })
    .then((settings) => {
      if (!settings.enabled) {
        console.log("IBS Consent Manager is disabled.");
        return;
      }

      const containerId = settings.gtmContainerId;

      if (!containerId) {
        console.warn("IBS: GTM Container ID is not configured.");
        return;
      }

      if (!/^GTM-[A-Z0-9]+$/.test(containerId)) {
        console.error("IBS: Invalid GTM Container ID.");
        return;
      }

      const mode = settings.consentMode;

      // Strict mode: load GTM only after at least one
      // optional category has been granted.
      const shouldLoadStrict =
        mode === "STRICT" &&
        (consent.analytics || consent.advertising);

      // Soft mode: load GTM after denied defaults.
      const shouldLoadSoft = mode === "SOFT";

      if (!shouldLoadStrict && !shouldLoadSoft) {
        console.log("IBS: GTM waiting for visitor consent.");
        return;
      }

      loadGTM(containerId);
    })
    .catch((error) => {
      console.error("IBS configuration error:", error);
    });

  function loadGTM(containerId) {
    if (window.__ibsGtmLoaded) return;

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

  console.log("IBS: Consent initialization completed.");
})();
