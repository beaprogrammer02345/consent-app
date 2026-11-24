import { authenticate } from "../shopify.server";
import { isIP } from "node:net";
import db from "../db.server";
import { createHash } from "node:crypto";
const geoLocationCache = new Map();
const GEO_CACHE_TTL = 60 * 60 * 1000;

function getGeoCacheKey(ip) {
  return createHash("sha256").update(ip).digest("hex");
}

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


 // 5. Select visitor IP candidate
 // Use the first valid IP from X-Forwarded-For.
// Shopify App Proxy: use the left-most valid X-Forwarded-For IP
const visitorIp =
  forwardedIps.find(ip => isIP(ip) !== 0) || null;

const visitorIpValid = visitorIp ? isIP(visitorIp) : 0;

console.info("IBS visitor IP selection:", {
  visitorIpAvailable: Boolean(visitorIp),
  visitorIpValid,
  selectedFrom: "X-Forwarded-For"
});


 console.info("IBS visitor IP selection:", {
  visitorIpAvailable: Boolean(visitorIp),
  visitorIpValid,
  matchesCloudflare:
   Boolean(cfConnectingIp) &&
   visitorIp === cfConnectingIp.trim(),
  selectedFrom:
   cfConnectingIp && isIP(cfConnectingIp.trim()) !== 0
    ? "Cloudflare connecting IP"
    : "First valid X-Forwarded-For entry"
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
 // Use IPGeolocation when Cloudflare location is incomplete.
const needsGeoApi =
  !cfCountry ||
  (cfCountry === "US" && !cfRegionCode);

if (needsGeoApi && visitorIp && visitorIpValid) {
  const cacheKey = getGeoCacheKey(visitorIp);

  const cachedLocation = geoLocationCache.get(cacheKey);

  if (
    cachedLocation &&
    Date.now() - cachedLocation.timestamp < GEO_CACHE_TTL
  ) {
    geoLocation = {
      ...cachedLocation.location,
      source: "ipgeolocation-cache"
    };

    console.info("IBS: Using cached IPGeolocation result.");
  } else {
    try {
      const apiKey = process.env.IPGEO_API_KEY;
      console.info("IBS IPGeolocation key diagnostic:", {
  keyPresent: Boolean(apiKey),
  keyLength: apiKey?.length || 0
});

      if (!apiKey) {
        throw new Error("IPGeolocation API key is missing.");
      }

      const apiUrl = new URL(
        "https://api.ipgeolocation.io/v3/ipgeo"
      );

      apiUrl.searchParams.set("apiKey", apiKey);
      apiUrl.searchParams.set("ip", visitorIp);
      console.info("IBS: Sending visitor IP to IPGeolocation.");
      const geoResponse = await fetch(apiUrl, {
        headers: {
          Accept: "application/json"
        },
        cache: "no-store",
        signal: AbortSignal.timeout(8000)
      });

      if (!geoResponse.ok) {
  const errorBody = await geoResponse.text();

  console.error("IBS IPGeolocation API error:", {
    status: geoResponse.status,
    response: errorBody
  });

  throw new Error(
    `IPGeolocation returned HTTP ${geoResponse.status}`
  );
}

      const geoData = await geoResponse.json();
      const location = geoData.location || {};

      if (!location.country_code2) {
        throw new Error("IPGeolocation returned no country code.");
      }

      const stateCode = location.state_code
        ? location.state_code.split("-").pop().toUpperCase()
        : null;

      const apiLocation = {
        countryCode: location.country_code2.toUpperCase(),
        regionName: location.state_prov || null,
        regionCode: stateCode,
        city: location.city || null
      };

      geoLocation = {
        ...apiLocation,
        source: "ipgeolocation"
      };

      geoLocationCache.set(cacheKey, {
        location: apiLocation,
        timestamp: Date.now()
      });

      console.info("IBS IPGeolocation result:", {
        countryCode: apiLocation.countryCode,
        regionName: apiLocation.regionName,
        regionCode: apiLocation.regionCode,
        city: apiLocation.city
      });

    } catch (error) {
      console.error(
        "IBS IPGeolocation lookup failed:",
        error.message
      );
    }
  }
} else if (!needsGeoApi) {
  console.info(
    "IBS: Cloudflare country and region information are sufficient."
  );
} else {
  console.warn(
    "IBS: IPGeolocation lookup skipped because no valid visitor IP was available."
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
