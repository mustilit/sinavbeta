// @ts-nocheck
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { writeFileSync } from 'fs';

async function exportOpenApi() {
  const app = await NestFactory.create(AppModule);
  const config = new DocumentBuilder()
    .setTitle('Dal API')
    .setDescription('Marketplace exam platform API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  writeFileSync('apps/backend/openapi.json', JSON.stringify(document, null, 2));
  await app.close();
  console.log('OpenAPI document written to apps/backend/openapi.json');
}

exportOpenApi().catch((e) => {
  console.error(e);
  process.exit(1);
});

