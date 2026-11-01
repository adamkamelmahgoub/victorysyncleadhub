import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./tests/browser',
  timeout:30_000,
  use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[
    {name:'desktop',use:{...devices['Desktop Chrome']}},
    {name:'mobile',use:{...devices['iPhone 13'],browserName:'chromium'}},
  ],
  webServer:{command:'pnpm --filter @workspace/leadgen exec vite --config vite.config.ts --host 127.0.0.1 --port 4173',url:'http://127.0.0.1:4173',
    reuseExistingServer:!process.env.CI,timeout:60_000,env:{VITE_SUPABASE_URL:'https://supabase.test',
      VITE_SUPABASE_ANON_KEY:'test-anon-key'}},
});
