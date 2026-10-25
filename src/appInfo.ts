import metadata from "../package.json";

export const APP_INFO = Object.freeze({
  name: metadata.productName,
  version: metadata.version,
  description: metadata.description,
  copyright: `Copyright © 2026 ${metadata.author.name}`,
});

export const APP_ID = "SystemInformation.App";
