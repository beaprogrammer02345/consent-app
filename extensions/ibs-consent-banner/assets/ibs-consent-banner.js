
(async () => {
  // --------------------------------------------------
  // 1. Wait for IBS initialization and geolocation
  // --------------------------------------------------

  if (window.IBSConsent?.ready) {
    try {
      await window.IBSConsent.ready;
    } catch (error) {
      console.warn(
        "IBS: Initialization was not completed successfully.",
        error
      );
    }
  }

  const root = document.getElementById("ibs-consent-root");

  if (!root || document.getElementById("ibs-consent-banner")) {
    return;
  }

  // Existing Theme Editor settings remain available as fallback.
  const themeSettings = root.dataset;

    // Retrieve merchant settings from the App Proxy response.
    const merchantSettings =
      window.IBSConsent?.getSettings?.() || {};

    // Prefer the settings saved in the IBS merchant dashboard.
    const settings = {
      heading:
        merchantSettings.bannerHeading ?? themeSettings.heading,

      message:
        merchantSettings.bannerMessage ?? themeSettings.message,

      accept:
        merchantSettings.acceptButtonText ?? themeSettings.accept,

      reject:
        merchantSettings.rejectButtonText ?? themeSettings.reject,

      manage:
        merchantSettings.manageButtonText ?? themeSettings.manage,

      analyticsLabel:
        merchantSettings.analyticsLabel ?? themeSettings.analyticsLabel,

      advertisingLabel:
        merchantSettings.advertisingLabel ?? themeSettings.advertisingLabel
    };

  const STORAGE_KEY = "ibs_consent_preferences";

  // --------------------------------------------------
  // 2. Read GPC status and calculated consent scope
  // --------------------------------------------------

  const gpcTestMode =
    new URLSearchParams(window.location.search)
      .get("ibs_gpc_test") === "1";

  const gpcDetected =
    window.IBSConsent?.gpcDetected ??
    (navigator.globalPrivacyControl === true || gpcTestMode);

  const consentScopeStatus =
    window.IBSConsent?.getScopeStatus?.() || null;

  console.log("IBS GPC detected in banner:", gpcDetected);

  console.log("IBS banner scope information:", {
    ...consentScopeStatus,
    bannerAvailable: true
  });

  // Important:
  // The banner remains available to all visitors.
  // consentRulesApply will be used for consent-rule
  // decisions, not to hide the banner.

  // --------------------------------------------------
  // 3. GPC restrictions
  // --------------------------------------------------

  function applyGPCRestriction(analytics, advertising) {
    if (gpcDetected) {
      return {
        analytics: false,
        advertising: false
      };
    }

    return {
      analytics,
      advertising
    };
  }

  // --------------------------------------------------
  // 4. Read and save visitor preferences
  // --------------------------------------------------
  
function readConsent() {
  try {
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

    // Migrate an existing visitor preference if present.
    const legacy = localStorage.getItem(STORAGE_KEY);

    if (legacy) {
      const parsed = JSON.parse(legacy);
      const migrated = saveConsent(
        parsed.analytics,
        parsed.advertising
      );

      localStorage.removeItem(STORAGE_KEY);

      return migrated;
    }

    return null;
  } catch (error) {
    console.warn("IBS: Unable to read consent:", error);
    return null;
  }
}

function saveConsent(analytics, advertising) {
  const saved = {
    necessary: true,
    analytics: Boolean(analytics),
    advertising: Boolean(advertising)
  };

  const cookieValue = encodeURIComponent(JSON.stringify(saved));

  const secure =
    window.location.protocol === "https:" ? "; Secure" : "";

  document.cookie =
    `${STORAGE_KEY}=${cookieValue}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;

  return saved;
}


  // --------------------------------------------------
  // 5. Shopify Customer Privacy API
  // --------------------------------------------------

  function loadShopifyPrivacyAPI() {
    return new Promise((resolve, reject) => {
      if (window.Shopify?.customerPrivacy) {
        resolve(window.Shopify.customerPrivacy);
        return;
      }

      if (!window.Shopify?.loadFeatures) {
        reject(
          new Error("Shopify Customer Privacy API is unavailable.")
        );
        return;
      }

      window.Shopify.loadFeatures(
        [
          {
            name: "consent-tracking-api",
            version: "0.2"
          }
        ],
        (error) => {
          if (error) {
            reject(error);
            return;
          }

          if (!window.Shopify.customerPrivacy) {
            reject(
              new Error("Customer Privacy API failed to initialize.")
            );
            return;
          }

          resolve(window.Shopify.customerPrivacy);
        }
      );
    });
  }

  async function updateShopifyConsent(analytics, advertising) {
    const privacyAPI = await loadShopifyPrivacyAPI();

    return new Promise((resolve) => {
      privacyAPI.setTrackingConsent(
        {
          analytics: analytics,
          marketing: advertising
        },
        () => {
          console.log("Shopify consent successfully updated.");

          console.log(
            "Current Shopify consent:",
            privacyAPI.currentVisitorConsent()
          );

          resolve();
        }
      );
    });
  }

  // --------------------------------------------------
  // 6. Create the consent banner
  // --------------------------------------------------

  const banner = document.createElement("div");
  banner.id = "ibs-consent-banner";

  banner.innerHTML = `
    <div class="ibs-banner-content">
      <h2>${escapeHtml(settings.heading || "We value your privacy")}</h2>
      <p>
        ${escapeHtml(settings.message || "")}
        <br>
        By clicking "Accept All", you consent to our use of cookies.
      </p>
    </div>

    <div class="ibs-banner-actions">
      <button class="ibs-consent-btn" data-action="manage">
        ${escapeHtml(settings.manage || "Manage Preferences")}
      </button>

      <button class="ibs-consent-btn" data-action="reject">
        ${escapeHtml(settings.reject || "Reject All")}
      </button>

      <button class="ibs-consent-btn ibs-accept" data-action="accept">
        ${escapeHtml(settings.accept || "Accept All")}
      </button>
    </div>
  `;

  // --------------------------------------------------
  // 7. Create the preferences modal
  // --------------------------------------------------

  const modal = document.createElement("div");
  modal.id = "ibs-consent-modal";

  modal.innerHTML = `
    <div class="ibs-modal-content">
      <h2>Manage Your Privacy Preferences</h2>

      <p class="ibs-modal-description">
        Choose which categories of cookies and tracking you allow.
        Necessary cookies are always active because the site can't
        function properly without them.
      </p>

      <div class="ibs-category">
        <div class="ibs-category-header">
          <h3>Necessary</h3>
          <span class="ibs-always-active">Always Active</span>
        </div>

        <p>
          Required for core site functionality, security, and
          remembering your preferences. Cannot be disabled.
        </p>
      </div>

      <div class="ibs-category">
        <div class="ibs-category-header">
          <h3>${escapeHtml(settings.analyticsLabel || "Analytics")}</h3>

          <label class="ibs-toggle">
            <input type="checkbox" id="ibs-analytics-toggle">
            <span class="ibs-toggle-slider"></span>
          </label>
        </div>

        <p>Helps us understand site usage and improve the experience.</p>
      </div>

      <div class="ibs-category">
        <div class="ibs-category-header">
          <h3>${escapeHtml(settings.advertisingLabel || "Advertising")}</h3>

          <label class="ibs-toggle">
            <input type="checkbox" id="ibs-advertising-toggle">
            <span class="ibs-toggle-slider"></span>
          </label>
        </div>

        <p>Used for advertising personalization and remarketing.</p>
      </div>

      <div class="ibs-modal-actions">
        <button class="ibs-consent-btn" data-action="reject">
          Reject All
        </button>

        <button class="ibs-consent-btn" data-action="save">
          Save Preferences
        </button>

        <button class="ibs-consent-btn ibs-accept" data-action="accept">
          Accept All
        </button>
      </div>
    </div>
  `;

  // --------------------------------------------------
  // 8. Cookie Preferences button
  // --------------------------------------------------

  const preferencesButton = document.createElement("button");
  preferencesButton.id = "ibs-cookie-preferences";
  preferencesButton.textContent = "Cookie Preferences";

  document.body.append(
    banner,
    modal,
    preferencesButton
  );

  const analyticsToggle =
    document.getElementById("ibs-analytics-toggle");

  const advertisingToggle =
    document.getElementById("ibs-advertising-toggle");

  // --------------------------------------------------
  // 9. Open and close preferences
  // --------------------------------------------------

  function openPreferences() {
    const consent = readConsent();

    analyticsToggle.checked = Boolean(consent?.analytics);
    advertisingToggle.checked = Boolean(consent?.advertising);

    modal.classList.add("ibs-open");
  }

  function closePreferences() {
    modal.classList.remove("ibs-open");
  }

  // --------------------------------------------------
  // 10. Update banner UI
  // --------------------------------------------------

  function updateUI() {
    const consent = readConsent();

    if (consent) {
      banner.style.display = "none";
      preferencesButton.classList.add("ibs-visible");
    } else {
      banner.style.display = "flex";
      preferencesButton.classList.remove("ibs-visible");
    }
  }

  // --------------------------------------------------
  // 11. Handle visitor choices
  // --------------------------------------------------

  async function handleChoice(action) {
    if (action === "manage") {
      openPreferences();
      return;
    }

    let analytics = false;
    let advertising = false;

    if (action === "accept") {
      analytics = true;
      advertising = true;
    } else if (action === "reject") {
      analytics = false;
      advertising = false;
    } else if (action === "save") {
      analytics = analyticsToggle.checked;
      advertising = advertisingToggle.checked;
    } else {
      return;
    }

    // Apply GPC restrictions before saving.
    const finalConsent = applyGPCRestriction(
      analytics,
      advertising
    );

    analytics = finalConsent.analytics;
    advertising = finalConsent.advertising;

    // Save visitor preferences.
    saveConsent(analytics, advertising);

    // Update Google Consent Mode v2 and GTM.
    if (window.IBSConsent) {
      window.IBSConsent.update({
        analytics: analytics,
        advertising: advertising
      });
    } else {
      console.error("IBS Consent Init has not loaded.");
    }

    // Update Shopify native privacy consent.
    try {
      await updateShopifyConsent(analytics, advertising);
    } catch (error) {
      console.error(
        "Shopify consent update failed:",
        error
      );
    }

    closePreferences();
    updateUI();
  }

  // --------------------------------------------------
  // 12. Event listeners
  // --------------------------------------------------

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");

    if (button) {
      handleChoice(button.dataset.action);
    }
  });

  preferencesButton.addEventListener(
    "click",
    openPreferences
  );

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closePreferences();
    }
  });

  // --------------------------------------------------
  // 13. Escape HTML
  // --------------------------------------------------

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };

      return entities[character];
    });
  }

  // --------------------------------------------------
  // 14. Initial UI update
  // --------------------------------------------------

  updateUI();

  console.log("IBS: Consent banner initialized.", {
    bannerAvailable: true,
    gpcDetected,
    consentScope: consentScopeStatus?.merchantScope,
    consentRulesApply: consentScopeStatus?.consentRulesApply
  });

})();
