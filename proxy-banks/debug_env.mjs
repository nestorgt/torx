import { config } from 'dotenv'; config({ path: '.secrets/.env' }); console.log('AIRWALLEX_CLIENT_ID:', process.env.AIRWALLEX_CLIENT_ID);
