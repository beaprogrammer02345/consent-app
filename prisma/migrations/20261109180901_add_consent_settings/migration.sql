-- CreateTable
CREATE TABLE "ConsentSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "gtmContainerId" TEXT NOT NULL DEFAULT '',
    "consentMode" TEXT NOT NULL DEFAULT 'STRICT',
    "consentScope" TEXT NOT NULL DEFAULT 'WORLDWIDE',
    "gpcEnabled" BOOLEAN NOT NULL DEFAULT true,
    "bannerHeading" TEXT NOT NULL DEFAULT 'We value your privacy',
    "bannerMessage" TEXT NOT NULL DEFAULT 'We use cookies to enhance your browsing experience.',
    "acceptButtonText" TEXT NOT NULL DEFAULT 'Accept All',
    "rejectButtonText" TEXT NOT NULL DEFAULT 'Reject All',
    "manageButtonText" TEXT NOT NULL DEFAULT 'Manage Preferences',
    "analyticsLabel" TEXT NOT NULL DEFAULT 'Analytics',
    "advertisingLabel" TEXT NOT NULL DEFAULT 'Advertising',
    "settingsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsentSettings_shop_key" ON "ConsentSettings"("shop");
