
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  // Verify that this request came through Shopify's app proxy.
  const { session } = await authenticate.public.appProxy(request);

  const url = new URL(request.url);

  // Use the authenticated session's shop where available.
  // Shopify's signed proxy request also contains the shop parameter.
  const shop =
    session?.shop || url.searchParams.get("shop");

  if (
    !shop ||
    !/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)
  ) {
    return Response.json(
      { error: "Invalid shop request." },
      { status: 400 }
    );
  }

  const settings = await db.consentSettings.findUnique({
    where: { shop },
    select: {
      enabled: true,
      gtmContainerId: true,
      consentMode: true,
      consentScope: true,
      gpcEnabled: true,
    },
  });

  // Safe defaults if the merchant has not saved settings yet.
  const publicSettings = settings ?? {
    enabled: false,
    gtmContainerId: "",
    consentMode: "STRICT",
    consentScope: "WORLDWIDE",
    gpcEnabled: true,
  };

  return Response.json(publicSettings, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
};
