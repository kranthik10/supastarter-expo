import type { ExpoConfig, ConfigContext } from 'expo/config';

const ENV = process.env.APP_VARIANT ?? process.env.EXPO_PUBLIC_APP_VARIANT ?? 'production';

const variantConfig: Record<string, { name: string; slug: string; scheme: string; bundleIdSuffix: string }> = {
  development: {
    name: 'Mobile SaaS (Dev)',
    slug: 'mobile-saas-dev',
    scheme: 'mobile-saas-dev',
    bundleIdSuffix: '.dev',
  },
  preview: {
    name: 'Mobile SaaS (Preview)',
    slug: 'mobile-saas-preview',
    scheme: 'mobile-saas-preview',
    bundleIdSuffix: '.preview',
  },
  production: {
    name: 'Mobile SaaS',
    slug: 'mobile-saas',
    scheme: 'mobile-saas',
    bundleIdSuffix: '',
  },
};

function getVariant() {
  return variantConfig[ENV] ?? variantConfig.production;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = getVariant();
  const scheme = process.env.EXPO_PUBLIC_APP_SCHEME ?? variant.scheme;
  const slug = process.env.EXPO_PUBLIC_APP_SLUG ?? variant.slug;

  return {
    ...config,
    name: process.env.EXPO_PUBLIC_APP_NAME ?? variant.name,
    slug,
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme,
    userInterfaceStyle: 'automatic',
    ios: {
      icon: './assets/expo.icon',
      bundleIdentifier: `com.mobilesaas.app${variant.bundleIdSuffix}`,
      supportsTablet: true,
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      package: `com.mobilesaas.app${variant.bundleIdSuffix}`,
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#208AEF',
          image: './assets/images/splash-icon.png',
          imageWidth: 76,
        },
      ],
      'expo-secure-store',
      'expo-localization',
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      appVariant: ENV,
      eas: {
        projectId: process.env.EAS_PROJECT_ID ?? '00000000-0000-0000-0000-000000000000',
      },
    },
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates: {
      url: process.env.EXPO_PUBLIC_UPDATES_URL,
    },
  };
};
