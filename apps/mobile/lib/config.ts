export const config = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://api.example.com',
  aiModel: process.env.EXPO_PUBLIC_AI_MODEL ?? 'gpt-4o-mini',
  appName: 'supastarter-expo',
} as const;
