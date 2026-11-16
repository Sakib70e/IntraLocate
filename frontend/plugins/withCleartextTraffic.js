const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin to permit HTTP cleartext communication for local-network testing.
 * Automatically injects android:usesCleartextTraffic and networkSecurityConfig into AndroidManifest.xml
 * and generates res/xml/network_security_config.xml during prebuild.
 */
const withCleartextTraffic = (config) => {
  // 1. Modify AndroidManifest.xml
  config = withAndroidManifest(config, async (config) => {
    const mainApplication = config.modResults.manifest.application?.[0];
    if (mainApplication) {
      mainApplication.$['android:usesCleartextTraffic'] = 'true';
      mainApplication.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    }
    return config;
  });

  // 2. Generate res/xml/network_security_config.xml
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const resXmlDir = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml'
      );
      await fs.promises.mkdir(resXmlDir, { recursive: true });

      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Permit cleartext HTTP for local-network development and testing -->
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    <!-- Explicit domain configuration for local subnets and localhost -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">192.168.31.202</domain>
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">10.0.2.2</domain>
        <domain includeSubdomains="true">127.0.0.1</domain>
    </domain-config>
</network-security-config>
`;
      await fs.promises.writeFile(
        path.join(resXmlDir, 'network_security_config.xml'),
        xmlContent,
        'utf8'
      );
      return config;
    },
  ]);

  return config;
};

module.exports = withCleartextTraffic;
