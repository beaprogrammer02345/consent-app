
import { authenticate } from "../shopify.server";
import { isIP } from "node:net";
import db from "../db.server";

export const loader = async ({ request }) => {
  // 1. Verify Shopify App Proxy request
  const { session } = await authenticate.public.appProxy(request);

  const url = new URL(request.url);

  // 2. Read geolocation-related headers
  const forwardedFor = request.headers.get("x-forwarded-for");

  const cfCountry =
    request.headers.get("cf-ipcountry")?.trim().toUpperCase() || null;

  const cfRegion =
    request.headers.get("cf-region")?.trim() || null;

  const cfRegionCode =
    request.headers.get("cf-region-code")?.trim().toUpperCase() || null;

  const cfConnectingIp =
    request.headers.get("cf-connecting-ip");

  console.info("IBS geolocation header diagnostic:", {
    forwardedForPresent: Boolean(forwardedFor),
    forwardedForEntryCount: forwardedFor
      ? forwardedFor.split(",").length
      : 0,
    cfConnectingIpPresent: Boolean(cfConnectingIp),
    cfCountry,
    cfRegion,
    cfRegionCode
  });

  // 3. Validate forwarded IP addresses
  const forwardedIps = (forwardedFor || "")
    .split(",")
    .map(ip => ip.trim())
    .filter(Boolean);

  console.info("IBS IP validation diagnostic:", {
    forwardedIpCount: forwardedIps.length,
    forwardedIpValidity: forwardedIps.map(ip => isIP(ip)),
    cfConnectingIpValid: cfConnectingIp
      ? isIP(cfConnectingIp.trim())
      : false
  });

  // 4. Compare Cloudflare IP with forwarded IP entries
  const normalizedCfIp = cfConnectingIp?.trim().toLowerCase();

  console.info("IBS IP source comparison:", {
    cfIpMatchesForwardedEntry: normalizedCfIp
      ? forwardedIps.map(
          ip => ip.toLowerCase() === normalizedCfIp
        )
      : null,
    forwardedIpCount: forwardedIps.length
  });

  // 5. Select visitor IP candidate
  const visitorIp = forwardedIps[0];

  const visitorIpValid = visitorIp ? isIP(visitorIp) : 0;

  console.info("IBS visitor IP selection:", {
    visitorIpAvailable: Boolean(visitorIp),
    visitorIpValid,
    selectedFrom: "X-Forwarded-For first entry"
  });

  // 6. Verify the shop
  const shop = session?.shop || url.searchParams.get("shop");

  if (
    !shop ||
    !/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)
  ) {
    return Response.json(
      { error: "Invalid shop request." },
      { status: 400 }
    );
  }

  // 7. Resolve visitor location
  let geoLocation = null;

  // Use Cloudflare country information first.
  if (cfCountry) {
    geoLocation = {
      countryCode: cfCountry,
      regionName: cfRegion,
      regionCode: cfRegionCode,
      source: "cloudflare"
    };
  }

  // Use IPAPI only when:
  // - Cloudflare country information is missing, OR
  // - The visitor is in the US and the state code is missing.
  const needsIpApi =
    !cfCountry ||
    (cfCountry === "US" && !cfRegionCode);

  if (needsIpApi && visitorIp && visitorIpValid) {
    try {
      const geoResponse = await fetch(
        `https://ipapi.co/${encodeURIComponent(visitorIp)}/json/`,
        {
          headers: {
            Accept: "application/json"
          },
          cache: "no-store",
          signal: AbortSignal.timeout(5000)
        }
      );

      if (!geoResponse.ok) {
        throw new Error(
          `IPAPI returned HTTP ${geoResponse.status}`
        );
      }

      const geoData = await geoResponse.json();

      if (geoData.error) {
        throw new Error(
          geoData.reason || "IPAPI lookup failed"
        );
      }

      geoLocation = {
        countryCode: geoData.country_code || cfCountry,
        regionName: geoData.region || cfRegion,
        regionCode: geoData.region_code || cfRegionCode,
        source: "ipapi"
      };

      console.info("IBS IPAPI location result:", geoLocation);

    } catch (error) {
      console.error(
        "IBS IPAPI lookup failed:",
        error.message
      );
    }
  } else if (!needsIpApi) {
    console.info(
      "IBS: Cloudflare location information is sufficient."
    );
  } else {
    console.warn(
      "IBS: IPAPI lookup skipped because no valid visitor IP was available."
    );
  }

  // 8. Retrieve existing merchant settings
  const settings = await db.consentSettings.findUnique({
    where: { shop },
    select: {
      enabled: true,
      gtmContainerId: true,
      consentMode: true,
      consentScope: true,
      gpcEnabled: true,
        
      bannerHeading: true,
      bannerMessage: true,
      acceptButtonText: true,
      rejectButtonText: true,
      manageButtonText: true,
      analyticsLabel: true,
      advertisingLabel: true
    }
  });

  // 9. Safe defaults if settings are not saved
  const publicSettings = settings ?? {
    enabled: false,
    gtmContainerId: "",
    consentMode: "STRICT",
    consentScope: "WORLDWIDE",
    gpcEnabled: true,
    bannerHeading: "We value your privacy",
    bannerMessage: "We use cookies to enhance your browsing experience.",
    acceptButtonText: "Accept All",
    rejectButtonText: "Reject All",
    manageButtonText: "Manage Preferences",
    analyticsLabel: "Analytics",
    advertisingLabel: "Advertising"
  };

  // 10. Return existing settings and location
  // Raw visitor IP is never included in the response.
  return Response.json(
    {
      ...publicSettings,
      geoLocation
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
};
