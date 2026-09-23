import dns from 'node:dns';
import { ValidationPipe, Logger, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getVersionInfo } from './version';

// Manche Hosts (z.B. Render) loesen ausgehende Hostnamen zu IPv6-Adressen
// auf, die von dort aus nicht routbar/sehr langsam sind, waehrend IPv4
// funktioniert. Betrifft Node's globales fetch (undici) - genutzt von
// @supabase/supabase-js und jose fuer Aufrufe an Supabase - nicht nur die
// pg-Verbindung. Muss vor jedem DNS-Lookup laufen, daher ganz am Anfang.
dns.setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const logger = new Logger('Bootstrap');

  const { version, gitCommit, gitBranch } = getVersionInfo();
  logger.log(
    `Version: ${version} | Commit: ${gitCommit} | Branch: ${gitBranch}`,
  );

  app.setGlobalPrefix('api', {
    exclude: [{ path: '', method: RequestMethod.GET }],
  });

  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'https://buerolist-frontend.vercel.app'];

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = process.env.PORT || 3001;
  await app.listen(port);
  logger.log(`Application is running on: ${await app.getUrl()}`);
}
void bootstrap();
