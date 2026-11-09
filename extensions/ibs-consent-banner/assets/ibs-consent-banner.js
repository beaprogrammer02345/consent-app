
(() => {
  const root = document.getElementById("ibs-consent-root");

  if (!root || document.getElementById("ibs-consent-banner")) {
    return;
  }

  const settings = root.dataset;

  const STORAGE_KEY = "ibs_consent_preferences";
  // Temporary development-only GPC test
const gpcTestMode =
  new URLSearchParams(window.location.search).get("ibs_gpc_test") === "1";

// Detect actual browser GPC or temporary test mode
const gpcDetected =
  navigator.globalPrivacyControl === true || gpcTestMode;

console.log("IBS GPC detected:", gpcDetected);
  
    // // Global Privacy Control detection
    // function isGPCEnabled() {
    // return navigator.globalPrivacyControl === true;
    // }

    // const gpcDetected = isGPCEnabled();

    // console.log("IBS GPC detected:", gpcDetected);
   
function applyGPCRestriction(analytics, advertising) {
  if (gpcDetected) {
    return {
      analytics: false,
      advertising: false,
    };
  }

  return {
    analytics,
    advertising,
  };
}

  function readConsent() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  }

  function saveConsent(analytics, advertising) {
    const consent = {
      necessary: true,
      analytics,
      advertising,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));

    return consent;
  }

  
function loadShopifyPrivacyAPI() {
  return new Promise((resolve, reject) => {
    if (window.Shopify?.customerPrivacy) {
      resolve(window.Shopify.customerPrivacy);
      return;
    }

    if (!window.Shopify?.loadFeatures) {
      reject(new Error("Shopify Customer Privacy API is unavailable."));
      return;
    }

    window.Shopify.loadFeatures(
      [
        {
          name: "consent-tracking-api",
          version: "0.2",
        },
      ],
      (error) => {
        if (error) {
          reject(error);
          return;
        }

        if (!window.Shopify.customerPrivacy) {
          reject(new Error("Customer Privacy API failed to initialize."));
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
        marketing: advertising,
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



  const savedConsent = readConsent();

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

  const preferencesButton = document.createElement("button");
  preferencesButton.id = "ibs-cookie-preferences";
  preferencesButton.textContent = "Cookie Preferences";

  document.body.append(banner, modal, preferencesButton);

  const analyticsToggle = document.getElementById("ibs-analytics-toggle");
  const advertisingToggle = document.getElementById("ibs-advertising-toggle");

  function openPreferences() {
    const consent = readConsent();

    analyticsToggle.checked = Boolean(consent?.analytics);
    advertisingToggle.checked = Boolean(consent?.advertising);

    modal.classList.add("ibs-open");
  }

  function closePreferences() {
    modal.classList.remove("ibs-open");
  }

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

// Save the final visitor selection.
saveConsent(analytics, advertising);


  // Update Shopify's native privacy consent.
  try {
    await updateShopifyConsent(analytics, advertising);
  } catch (error) {
    console.error("Shopify consent update failed:", error);
  }

  closePreferences();
  updateUI();
}


  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");

    if (button) {
      handleChoice(button.dataset.action);
    }
  });

  preferencesButton.addEventListener("click", openPreferences);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closePreferences();
    }
  });

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };

      return entities[character];
    });
  }

  updateUI();
})();
