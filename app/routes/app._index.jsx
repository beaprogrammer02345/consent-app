
import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const DEFAULT_SETTINGS = {
  enabled: true,
  gtmContainerId: "GTM-W6FC6DCM",
  consentMode: "STRICT",
  consentScope: "WORLDWIDE",
  gpcEnabled: true,
  bannerHeading: "We value your privacy",
  bannerMessage:
    "We use cookies to enhance your browsing experience.",
  acceptButtonText: "Accept All",
  rejectButtonText: "Reject All",
  manageButtonText: "Manage Preferences",
  analyticsLabel: "Analytics",
  advertisingLabel: "Advertising",
};

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const settings = await db.consentSettings.findUnique({
    where: { shop: session.shop },
  });

  return {
    settings: settings ?? DEFAULT_SETTINGS,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const consentMode = formData.get("consentMode");
  const consentScope = formData.get("consentScope");

  const validModes = ["STRICT", "SOFT"];
  const validScopes = ["CALIFORNIA", "US", "WORLDWIDE"];

  if (!validModes.includes(consentMode)) {
    return { success: false, error: "Invalid consent mode." };
  }

  if (!validScopes.includes(consentScope)) {
    return { success: false, error: "Invalid consent scope." };
  }

  const settings = {
    enabled: formData.get("enabled") === "true",
    gtmContainerId: String(formData.get("gtmContainerId") ?? "").trim(),
    consentMode,
    consentScope,
    gpcEnabled: formData.get("gpcEnabled") === "true",
    bannerHeading: String(formData.get("bannerHeading") ?? ""),
    bannerMessage: String(formData.get("bannerMessage") ?? ""),
    acceptButtonText: String(formData.get("acceptButtonText") ?? ""),
    rejectButtonText: String(formData.get("rejectButtonText") ?? ""),
    manageButtonText: String(formData.get("manageButtonText") ?? ""),
    analyticsLabel: String(formData.get("analyticsLabel") ?? ""),
    advertisingLabel: String(formData.get("advertisingLabel") ?? ""),
  };

  await db.consentSettings.upsert({
    where: { shop: session.shop },
    update: settings,
    create: {
      shop: session.shop,
      ...settings,
    },
  });

  return { success: true };
};

function Field({ label, name, value, type = "text" }) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <label
        htmlFor={name}
        style={{
          display: "block",
          fontWeight: 600,
          marginBottom: "6px",
        }}
      >
        {label}
      </label>

      <input
        id={name}
        name={name}
        type={type}
        defaultValue={value ?? ""}
        style={{
          width: "100%",
          padding: "10px",
          border: "1px solid #8c9196",
          borderRadius: "6px",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function SelectField({ label, name, value, options }) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <label
        htmlFor={name}
        style={{
          display: "block",
          fontWeight: 600,
          marginBottom: "6px",
        }}
      >
        {label}
      </label>

      <select
        id={name}
        name={name}
        defaultValue={value}
        style={{
          width: "100%",
          padding: "10px",
          border: "1px solid #8c9196",
          borderRadius: "6px",
          background: "white",
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function Index() {
  const { settings } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const isSaving =
    fetcher.state === "submitting" ||
    fetcher.state === "loading";

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Consent settings saved");
    }

    if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error);
    }
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="IBS Consent Mode Manager">
      <s-section heading="General Settings">
        <fetcher.Form method="post">
          <SelectField
            label="Consent Manager Status"
            name="enabled"
            value={String(settings.enabled)}
            options={[
              { label: "Enabled", value: "true" },
              { label: "Disabled", value: "false" },
            ]}
          />

          <Field
            label="Google Tag Manager Container ID"
            name="gtmContainerId"
            value={settings.gtmContainerId}
          />

          <SelectField
            label="GTM Consent Mode"
            name="consentMode"
            value={settings.consentMode}
            options={[
              { label: "Strict Mode", value: "STRICT" },
              { label: "Soft Mode", value: "SOFT" },
            ]}
          />

          <SelectField
            label="Consent Scope"
            name="consentScope"
            value={settings.consentScope}
            options={[
              { label: "California", value: "CALIFORNIA" },
              { label: "All United States", value: "US" },
              { label: "Worldwide", value: "WORLDWIDE" },
            ]}
          />

          <SelectField
            label="Global Privacy Control (GPC)"
            name="gpcEnabled"
            value={String(settings.gpcEnabled)}
            options={[
              { label: "Enabled", value: "true" },
              { label: "Disabled", value: "false" },
            ]}
          />

          <s-divider />

          <s-section heading="Consent Banner Content">
            <Field
              label="Banner Heading"
              name="bannerHeading"
              value={settings.bannerHeading}
            />

            <Field
              label="Banner Message"
              name="bannerMessage"
              value={settings.bannerMessage}
            />

            <Field
              label="Accept All Button"
              name="acceptButtonText"
              value={settings.acceptButtonText}
            />

            <Field
              label="Reject All Button"
              name="rejectButtonText"
              value={settings.rejectButtonText}
            />

            <Field
              label="Manage Preferences Button"
              name="manageButtonText"
              value={settings.manageButtonText}
            />

            <Field
              label="Analytics Category Label"
              name="analyticsLabel"
              value={settings.analyticsLabel}
            />

            <Field
              label="Advertising Category Label"
              name="advertisingLabel"
              value={settings.advertisingLabel}
            />
          </s-section>

          <s-button
            type="submit"
            variant="primary"
            {...(isSaving ? { loading: true } : {})}
          >
            Save Consent Settings
          </s-button>
        </fetcher.Form>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
